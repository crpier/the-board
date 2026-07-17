# ADR 0007 - Meme Publish Lifecycle and Server-Authoritative Validation

Date: 2026-06-29
Status: accepted

## Context

The Ownership / Uploads epic (#26) publishes a meme from media the browser has
already uploaded directly to R2 (ADR 0005): the client calls `generateUploadUrl`,
PUTs the bytes, runs `syncUploadedMetadata`, and then asks the backend to create
the meme from the resulting object `key`. Three forces shape how `createMeme` is
built:

- **Single-step publish, async lifecycle.** The product models a `processing`
  state and requires media optimization before publish (`docs/product-overview.md`),
  but optimization needs external compute that does not exist yet and is deferred
  to #25. The epic's decision is to ship publish as a single step now while
  wiring the async `processing → ready/failed` path, so #25 only has to make the
  flip do real work.
- **Validation must be server-authoritative.** The upload UI is untrusted, so the
  `mediaType` and size limits (image 10 MB / GIF 25 MB / video 100 MB) have to be
  re-derived and re-checked on the server against the object's real content-type
  and size, not taken from client arguments.
- **A rejected upload must not strand bytes.** Because the object exists in R2
  before any meme row references it, a validation failure has to delete the
  orphaned object — the cleanup ADR 0005 deferred to "later slices".

## Decision

`convex/memes.ts` exposes `createMeme` as an **action**, backed by two internal
mutations that own the lifecycle.

### `createMeme` is an action, not a mutation

The deciding constraint is orphan cleanup. Deleting an R2 object goes through the
component's `deleteObject`, which removes the metadata row and schedules the
actual S3 delete. If `createMeme` were a mutation that deleted the object and
then threw on a validation failure, the throw would roll the delete back with the
transaction, stranding the object. An action is not a single transaction, so it
runs the delete as its own committed step and then throws — leaving neither a
meme nor an orphaned object. The action derives `authorId` server-side via
`getAuthUserId` (never from arguments) and reads the object's content-type and
size back from the synced R2 metadata as the source of truth. The upload UI uses
our `syncUploadedMetadata` action rather than the component-generated
`syncMetadata` mutation because the latter schedules metadata sync
asynchronously and can race an immediate publish.

### Validation, then hand off to a transactional insert

After deriving `mediaType` from the real content-type (`image/gif` is matched
before the generic `image/` prefix so GIFs get the 25 MB ceiling, not the image
10 MB one) and checking the size ceiling, the action calls an internal mutation
that inserts the meme as `status: "processing"` and, in the same transaction,
schedules the lifecycle flip. Insert and schedule share one transaction so a meme
is never persisted without its finalize step queued. Tags are canonicalized on
this write path (ADR-aligned with `docs/glossary.md`).

### The lifecycle flip is a self-guarding stub

A separate internal mutation performs the `processing → ready` flip. Today it is
a stub that immediately marks the meme `ready`; it no-ops unless the meme is
still `processing`, so a stale or retried invocation can't resurrect a deleted
meme or clobber a later status. #25 replaces this body with real optimization
that emits `ready` or `failed`; nothing else in the publish path has to change.

## Considered alternatives

- **`createMeme` as a mutation.** Simpler and transactional, and metadata reads
  work from a mutation. Rejected because the orphan-cleanup delete would roll back
  with the validation failure, defeating the "no orphaned object" requirement.
- **Synchronous publish with no `processing` state.** Would be simpler now, but
  throws away the async lifecycle the product already models and would force #25
  to re-architect the publish path rather than just fill in the flip.
- **Trusting a client-supplied `mediaType`.** Rejected outright: validation is
  server-authoritative, so the type is derived from the stored object, not args.

## Consequences

- Publish crosses runtimes: an action for validation/cleanup plus internal
  mutations for the transactional insert and the flip. This is the idiomatic
  Convex shape for "do non-transactional work, then commit atomically".
- Until #25 lands, a freshly published meme is marked `ready` without real
  optimization; originals are served. This is the epic's accepted, temporary
  stub, not product truth.
- The component-backed delete and the scheduled flip make `createMeme` awkward to
  exercise in `convex-test`: the suite mounts the R2 component and its nested
  action-retrier, seeds object metadata directly, and drains the scheduled flip.
  The real upload → publish round trip against a live bucket is still a manual
  acceptance check, as with the other R2 helpers.
