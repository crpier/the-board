# ADR 0005 - R2 Object Storage for Meme Media

Date: 2026-06-28
Status: accepted

## Context

The Ownership / Uploads slice introduces user-uploaded media (images, GIFs,
videos). Until now `memes.mediaUrl` was a bare string and no upload path existed.
We need a place to put the bytes and a way to serve them to a browse-first,
media-heavy feed.

The project has a deliberate Convex-native bias (ADR-0002 chose client-side
rendering backed directly by Convex over a separate backend), so Convex's
built-in file storage is the obvious default. Two facts pushed against it:

- The product is media-serving-dominated, and the operator will bulk-import an
  existing collection (~1000 memes, ~200 short videos). Convex is not a CDN and
  bills egress; that is the wrong cost curve for serving lots of image/video
  bytes.
- Cloudflare R2 has **zero egress fees** and a perpetual free tier (10 GB-month
  storage, 1M Class A / 10M Class B ops) that comfortably covers the initial
  collection, and it fronts cleanly with the Cloudflare CDN via a custom domain.

## Decision

Meme media is stored in **Cloudflare R2**, integrated through the
`@convex-dev/r2` Convex component and served through a **Cloudflare custom
domain** (the `r2.dev` URL is rate-limited and dev-only). A meme stores the **R2
object key** as its domain reference; the feed/detail read path resolves the key
to a CDN URL at query time (consistent with ADR-0001's caller-optimized read
interface). Upload uses a presigned PUT straight from the client to R2; the
server validates the landed object's real content-type and size before creating
the meme.

## Considered alternatives

- **Convex file storage.** Simplest and most on-brand for a Convex-native repo,
  and `storageId` would give the same key-indirection. Rejected because it is not
  a CDN and bills egress, which is the dominant cost for this workload at any real
  traffic.
- **S3 + CloudFront.** Equivalent capability, but more infrastructure and no
  egress-free tier; R2 + Cloudflare gets the same outcome with less cost and a
  component that keeps the upload flow Convex-driven.

## Consequences

- The stored reference is an opaque R2 **object key**, not a URL. Swapping the
  serving layer later (different CDN, migrated bucket) touches only the
  key→URL resolver, not the schema or the feed.
- Enabling R2 requires adding billing info to Cloudflare even though usage stays
  within the free tier.
- Bytes upload directly to R2 via presigned PUT, so the server never sees them in
  flight; size/type enforcement is therefore server-authoritative against R2
  object metadata, with client-side checks for UX only.
- **Media optimization cannot run inside the Convex runtime** (no native ffmpeg /
  image binaries). It needs external compute that writes the optimized object
  back to R2 and flips the meme lifecycle. Tracked separately (issue #25); this
  slice ships with optimization stubbed.
