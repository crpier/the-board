# ADR 0013 - Per-User Rate Limiting via the Convex Rate Limiter Component

Date: 2026-07-17
Status: accepted

## Context

`createMeme`, `castVote`, and `updateMeme` had no throughput limit: any
authenticated user could call them as fast as their client could fire
requests. `createMeme` moves media through R2 and writes a `memes` row;
`castVote` and `updateMeme` are cheap individually but are exactly the
mutations a scripted client would hammer (vote-brigading a meme, or
edit-spamming to keep re-triggering the `searchText` recompute). Nothing in
the product overview or existing ADRs addressed abuse throughput, and the
mutations had no defense beyond normal auth (#69).

Two questions needed answering:

- **What enforces the limit, and where?** Hand-rolled counters in `memes` /
  `votes` documents, or an existing component built for this.
- **What does a rejected call look like to the client?** A generic thrown
  `Error` (indistinguishable from any other failure), or something a UI can
  detect and phrase specifically.

## Decision

**Use `@convex-dev/rate-limiter`, Convex's own component, rather than
hand-rolled counters.** It is transactional (a rate-limit consumption rolls
back with the rest of the mutation), does not require a document per user
per limit growing unbounded, and ships a typed rejection path. Registered in
`convex/convex.config.ts` alongside the existing `r2` component; configured
once in `convex/rateLimiter.ts` as a single `RateLimiter` instance shared by
every mutation that needs it.

**Every limit is a per-user "token bucket," keyed by `Id<"users">`, not
global or per-IP.** Token bucket (vs. "fixed window") lets a real user burst
— vote on several cards in a row, fix a typo shortly after publishing —
while still capping sustained throughput. A fixed window resets all-at-once
on a calendar boundary, which reads as arbitrary lockout mid-session; token
bucket refills continuously instead.

Chosen limits (see `convex/rateLimiter.ts` for the authoritative config):

| Limit        | Rate        | Rationale                                                                                              |
| ------------ | ----------- | ------------------------------------------------------------------------------------------------------ |
| `uploadMeme` | 10 / hour   | Uploads move real bytes through R2 and create a row; generous for a posting session, tight on spam.    |
| `castVote`   | 60 / minute | Voting is the highest-frequency action (every card click); budget stays far above deliberate clicking. |
| `updateMeme` | 30 / hour   | Edits are infrequent relative to uploads/votes; allows a few revisions without enabling edit-spam.     |

`deleteMeme` and `moderateMeme` are **not** rate-limited: delete is
naturally self-limiting (a user only has so many memes to delete), and
moderation is an admin-trust action, out of this issue's scope.

**Rejection is `rateLimiter.limit(ctx, name, { key, throws: true })`,
which throws a `ConvexError` carrying `{ kind: "RateLimited", name,
retryAfter }`** — the component's own typed shape, detected client-side with
its exported `isRateLimitError` guard rather than a hand-rolled
`{code, retryAfter}` payload wrapping it a second time. `src/lib/errors.ts`
centralizes turning that into a friendly string ("Slow down — try again in
Xs"), reused by the upload form, the meme edit form, and the vote control —
the same inline-`error`-signal pattern every other mutation failure in this
app already uses (no toast system exists or was introduced).

The limit check runs **before** the work it guards: in `createMeme`, before
the R2 metadata read; in `updateMeme`, right after `requireOwnedMeme`
confirms ownership (using the already-resolved `meme.authorId` as the key,
avoiding a redundant null check); in `castVote`, right after the
authentication check, before the meme lookup. A rejected call therefore
never pays for work past the auth/ownership gate.

## Consequences

- Convex codegen could not be run in this environment (no
  `CONVEX_DEPLOYMENT`/login available), so `convex/_generated/api.d.ts` was
  hand-extended with the `components.rateLimiter` type declarations that
  `npx convex dev` would otherwise generate from
  `@convex-dev/rate-limiter`'s bundled component schema. This is safe because
  `components` is a runtime `Proxy` (`componentsGeneric()`) that resolves
  function references by name regardless of the `.d.ts` — the hand-written
  types only restore compile-time checking, they don't affect runtime
  behavior. **Whoever deploys this branch should run `npx convex dev` (or
  `codegen`) once to let Convex regenerate this file from the real component,
  and diff it against the hand-written version** as a sanity check.
- Tests exercising `createMeme`, `castVote`, or `updateMeme` must call
  `rateLimiterTest.register(t)` (from `@convex-dev/rate-limiter/test`) on
  their `convexTest` instance, the same way existing tests already register
  `r2Test` and `actionRetrier`. Three new tests
  (`convex/votes.test.ts`, `convex/memes.test.ts`) assert the rejection path
  end-to-end: exhaust a bucket, then assert the next call throws a
  `RateLimited` error with a positive `retryAfter`.
- Limits are per-account. A user working around them with multiple accounts
  is not addressed here — that would need a different key (device/IP) with
  its own false-positive tradeoffs, deliberately left out of this slice.
- `VoteControl` now surfaces an error message it previously always swallowed
  (the optimistic update already self-reverts on any failure) — but only for
  a detected rate limit; every other vote failure stays silent, matching the
  prior behavior, since votes fail for reasons (deleted/hidden meme) that
  aren't actionable for the user clicking a stale card.
