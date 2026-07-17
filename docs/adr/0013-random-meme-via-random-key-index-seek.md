# ADR 0013 - Random Meme Discovery via a Random-Key Index Seek

Date: 2026-07-17
Status: accepted

## Context

Issue #66 asks for a "Random" nav action: land on a random public, ready
meme's detail page, with repeated clicks yielding varied results, never a
private or hidden meme, and no cost growth as the `memes` table grows.

Convex has no native "random document" primitive, and two easy-looking
approaches don't hold up:

- **`.collect()` the eligible ids and pick one client- or server-side.** Reads
  the entire `public`+`ready` partition on every click — the exact full-table
  scan the acceptance criteria rule out, and it gets slower as the library
  grows toward the planned large import (ADR 0010's stated pressure).
- **Skip a random offset via `.take(n)`.** Convex pagination has no
  cursor-by-offset; simulating one still means reading up to `n` documents
  server-side, and `n` has to grow with the table to keep the skip range
  meaningful.

Randomness inside a Convex **query** also needs care: a query is expected to
be a pure function of its arguments (re-running it with the same arguments
against unchanged data should return the same result). Calling `Math.random()`
directly inside a query body would make two calls with identical arguments
diverge, which the framework doesn't forbid outright but works against.

## Decision

**A denormalized `randomKey: v.optional(v.number())` field on `memes`, seeked
through a three-field index.**

- Every meme gets a `randomKey = Math.random()` once, at insert
  (`insertProcessingMeme`). It is never rewritten — it has no relation to
  recency, votes, or any other field, just a stable, uniformly distributed tag.
- A new index, `by_visibility_and_status_and_randomKey` (`["visibility",
"status", "randomKey"]`), lets `randomKey` be seeked _within_ the
  `public`+`ready` partition rather than across the whole table.
- The public query `getRandomMeme` takes a **client-generated `seed: number`**
  in `[0, 1)` — the client calls `Math.random()`, not the server. The query
  body is then a pure, deterministic function of `seed`: seek the first
  `public`+`ready` meme with `randomKey >= seed` via the index (`.first()`,
  O(log n)); if none exists (the seed landed past the highest key), wrap
  around to the smallest key in the partition; if the partition is empty,
  return `null`. Two calls with the same `seed` against unchanged data return
  the same meme — the _client_ supplying a fresh seed each click is what makes
  repeated clicks land on different memes, not server-side non-determinism.
- The nav "Random" button calls this query as a one-off `client.query(...)`
  (not the reactive `useQuery` hook — a single click-to-navigate has no
  ongoing subscription to keep live) and navigates to `/meme/:id` on success.
- `randomKey` stays `optional`, same reasoning as `searchText` (ADR 0010): a
  schema push validates every existing document, so the field ships before a
  backfill can populate it. A bounded, idempotent `backfillRandomKey` internal
  mutation (mirroring `backfillSearchText`) assigns keys to pre-existing rows
  post-deploy.

## Consequences

- Lookup cost is a single indexed `.first()` (plus, in the wraparound case, a
  second one) — O(log n) via the B-tree index, not O(n). This holds as the
  table grows, satisfying the "no full table scan" criterion directly.
- Because visibility/status are the index's leading fields, a private or
  non-`ready` meme is structurally unreachable — it isn't in the index
  partition `getRandomMeme` seeks, not merely filtered out after the fact.
- Rows missing `randomKey` (pre-backfill legacy rows) sort first and are
  reachable only through the wraparound branch until `backfillRandomKey` runs
  — a temporary skew toward the un-backfilled tail, not a broken or
  permanently unreachable meme. Deploy order: ship the schema/query change,
  then run the backfill once.
- Distribution is only as uniform as `Math.random()` and the spread of
  existing keys; with very few memes (or many memes sharing near-identical
  keys from a low-entropy RNG) the seek can be mildly biased toward
  keys following a sparse gap. Not a concern at this table's scale, and no
  worse than the alternatives.
- No new failure mode for "no public memes yet": `getRandomMeme` returns
  `null` in that case, same shape as `getMeme`'s not-found, and the nav
  surfaces a small inline message instead of navigating.
