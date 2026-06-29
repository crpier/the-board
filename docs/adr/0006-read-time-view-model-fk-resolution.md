# ADR 0006 - Read-Time View-Model and Foreign-Key Resolution

Date: 2026-06-29
Status: accepted

## Context

Meme documents hold foreign keys, not display data: `authorId` references a
`users` row and `mediaKey` is an R2 object key. The client needs an author
display name and a media URL, neither of which is stored on the meme.

Two common shortcuts are tempting and both are wrong for this project:

- Denormalizing `authorName` onto the meme, which goes stale on profile rename
  and needs a backfill to correct.
- Returning the raw `Doc<"memes">` and resolving keys on the client, which
  leaks internal foreign keys and storage keys across the API boundary and
  couples the client to the storage layout.

ADR-0001 already moves the feed toward a caller-optimized interface, but it is
about hiding _transport_ wiring (SSR prefetch, live subscriptions, the concrete
query reference) behind `usePublicFeed()`. It does not govern the _shape_ of the
data a meme read returns. That is a distinct, durable decision and gets its own
record here.

## Decision

Meme reads return a resolved **view-model**, never the raw `Doc<"memes">`.

- Foreign keys are resolved server-side inside the query: `authorId → users.name`
  (a live display name, `"Anon"` fallback) and `mediaKey → ` CDN URL via
  `resolveUrl` (ADR-0005). Display data is resolved at read time, never
  denormalized onto the meme.
- Raw foreign keys (`authorId`, `mediaKey`) never leave the query.
- The view-model shape is defined once as a Convex validator
  (`feedMemeValidator` in `convex/memes.ts`); the `FeedMeme` TypeScript type is
  inferred from it, and it is the query's `returns` validator. The runtime
  `returns` check is what enforces "no raw FK leaks" — a future field addition
  that exposed an FK would fail validation rather than silently ship.

## Consequences

- A profile rename is reflected everywhere immediately, with no backfill.
- The client depends on a stable presentation shape, not on storage internals;
  the R2 key layout and the `users` schema can change without client churn.
- Reads cost one extra `ctx.db.get` per author per page. Acceptable at current
  page sizes; dedupe authors per page if it becomes a hotspot.
- The `returns` validator restates the pagination envelope. This is mild
  boilerplate, accepted as the price of the runtime no-leak guarantee.
