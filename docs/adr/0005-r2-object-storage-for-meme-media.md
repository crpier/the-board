# ADR 0005 - R2 Object Storage for Meme Media

Date: 2026-06-29
Status: accepted

## Context

Memes carry one primary media item (image, GIF, or video), and the product is
browse-first: the feed and detail pages serve media to guests on every page
load, at the recommended input sizes of up to 10 MB images, 25 MB GIFs, and
100 MB videos. We need a place to store those bytes and a way to serve them
publicly and cheaply.

The project has a Convex-native bias (client-side rendering straight off Convex,
denormalized counts on documents, per-card reactive queries). Convex ships its
own file storage, which would be the lowest-friction choice and keep everything
in one system.

Two pressures push the other way:

- **Egress and scale.** A browse-first media app's dominant cost is serving
  bytes, repeatedly, to anonymous traffic. Cloudflare R2 has zero egress fees
  and fronts objects with a CDN on a custom domain; Convex storage is metered
  differently and is not positioned as a public media CDN.
- **Optimization pipeline (#25).** Media must be optimized before publish.
  Treating media as plain S3-compatible objects keeps that pipeline and any
  future processing (perceptual hashing, transforms) working against a standard
  object store rather than a Convex-specific storage API.

## Decision

Use **Cloudflare R2 as the media object store**, integrated through the
`@convex-dev/r2` Convex component, and serve objects publicly through a
**Cloudflare custom domain** rather than the `r2.dev` URL.

### Component wiring

`convex/convex.config.ts` registers the component (`app.use(r2)`), and
`convex/r2.ts` constructs a single `R2` client from `components.r2`. The client
reads bucket credentials from the **Convex deployment environment**, not the
SolidJS client env (`src/env.ts`), because these are server secrets:

| Variable               | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `R2_BUCKET`            | Bucket name                                          |
| `R2_ENDPOINT`          | Account S3 API endpoint                              |
| `R2_ACCESS_KEY_ID`     | R2 API token access key                              |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret                                  |
| `R2_PUBLIC_URL`        | Cloudflare custom domain base for public CDN serving |

The first four are consumed by the component itself; `R2_PUBLIC_URL` is ours.
Set them with `npx convex env set <NAME> <value>`.

### Server helpers

`convex/r2.ts` exposes:

- `generateUploadUrl` — presigned PUT URL for direct browser → R2 upload.
- `syncMetadata` — HEAD the object and persist content-type + size in Convex.
- `getMetadata` — read that content-type + size back.
- `deleteObject` — remove an object and its metadata.
- `getMediaUrl` / `resolveUrl(key)` — map an object key to its public CDN URL.

`generateUploadUrl` and `deleteObject` are auth-gated via the component's
`checkUpload` / `checkDelete` callbacks (`getAuthUserId`), matching the
voting rule that participation requires authentication. Reads and metadata stay
open, since public serving must work for guests.

### Custom domain for serving, not presigned reads

The component's `getUrl` returns a short-lived **presigned** GET URL against the
R2 endpoint. That is unsuitable for a browse-first feed: the URLs expire, are not
cacheable, and the bundled `r2.dev` host is rate-limited and dev-only. So public
serving goes through `resolveUrl`, which builds `${R2_PUBLIC_URL}/${key}` against
the Cloudflare custom domain — a stable, CDN-cacheable URL. Key path segments are
encoded individually so `/` stays a separator. This is the load-bearing choice
that makes R2 worth it over Convex storage: the CDN, not Convex, serves the bytes.

## Considered alternatives

- **Convex file storage.** Simplest and most on-brand for a Convex-native repo,
  and `storageId` would give the same key-indirection. Rejected because it is not
  a CDN and bills egress, which is the dominant cost for this workload at any real
  traffic.
- **S3 + CloudFront.** Equivalent capability, but more infrastructure and no
  egress-free tier; R2 + Cloudflare gets the same outcome with less cost and a
  component that keeps the upload flow Convex-driven.

## Consequences

- Enabling R2 requires billing info on the Cloudflare account even though
  expected usage stays in the free tier; this is a one-time manual ops step
  alongside binding the custom domain to the bucket.
- Media bytes live outside Convex, so object lifecycle is two-phase: an R2 object
  exists before any meme row references it. Binding a key to a meme, optimizing
  it (#25), and cleaning up orphaned objects are owned by later slices; this
  slice only moves and serves bytes.
- Because serving bypasses the component's presigned `getUrl`, bucket objects
  reachable on the custom domain are world-readable by key. Keys are unguessable
  (UUIDs), and only public, ready memes expose their keys — acceptable for a
  public media product, but it means R2 is not the place for private bytes.
- `getMediaUrl` throws if `R2_PUBLIC_URL` is unset, surfacing a misconfigured
  deployment loudly instead of serving broken links.
