# ADR 0004 - Voting Model and Per-Card Reactive Vote State

Date: 2026-06-28
Status: accepted

## Context

The Voting slice is the first participation flow after the Auth Foundation. The
product rules: voting requires authentication, each user holds one active vote
per meme (upvote, downvote, or no vote), signed-out users see disabled controls,
and feed and detail surfaces show aggregate upvote/downvote counts.

Several decisions interact, and the existing feed architecture constrains them:

- `memes` already carries denormalized `upvoteCount` / `downvoteCount`.
- The public feed query `listPublicMemes` is a pure, public, paginated query.
- The feed route loads page 1 reactively but loads page 2+ via one-shot,
  non-reactive `convex.query` calls accumulated in component state
  (see `src/routes/index.tsx`). Items on later pages are therefore not backed by
  a live subscription.
- Convex `optimisticUpdate` patches the query cache, so it only reflects on
  values backed by a live subscription, and Convex executes mutations
  exactly-once with automatic optimistic rollback when a mutation settles.

## Decision

### Vote storage

A `votes` table holds one row per active vote, keyed by `(userId, memeId)` with
`value: "up" | "down"` and an index `by_user_and_meme`. "No vote" is the absence
of a row; clearing a vote deletes the row. The table therefore always means
"active votes," which keeps the one-active-vote invariant explicit.

### Aggregate counts

Counts stay denormalized on `memes`. The `castVote` mutation adjusts the vote
row and the two counters in the same transaction. Convex mutations are atomic,
so the counters cannot drift as long as every write goes through `castVote`.
This avoids per-meme count subqueries on the feed, which matters for a
browse-first, feed-heavy product.

### Mutation shape

`castVote({ memeId, value: "up" | "down" })` with server-side toggle semantics:
clicking the direction you already hold clears it, the opposite flips it, and
none creates it. The server reads committed state and decides the transition, so
the client stays dumb and rapid clicks degrade gracefully. The mutation requires
authentication and validates that the target meme exists and is
`visibility:"public"` + `status:"ready"`; votes can only attach to memes a
viewer could legitimately see. Votes are not retroactively unwound when a meme
is later hidden.

Toggle is not idempotent, which would matter on an at-least-once backend; on
Convex it does not, because mutations execute exactly-once.

### Per-card reactive state

Each card subscribes to `votes.cardState({ memeId })`, which returns
`{ upvoteCount, downvoteCount, myVote }` (`myVote` is `null` for guests). This is
the load-bearing decision:

- Counts and the viewer's own vote come from one live per-card subscription,
  independent of which feed page loaded the card. This sidesteps the non-reactive
  `loadMore` path: page-2+ cards still get reactive counts.
- A single per-card query is what `optimisticUpdate` patches, so the highlight
  and the count move together and self-revert on failure, uniformly across pages.
- The vote control becomes self-contained, so the future detail page reuses it
  with no rework.

The counts baked into the feed item are initial paint only, superseded by
`cardState` once it resolves.

### Optimistic updates

The shared `useMutation` wrapper (`src/lib/convex-solid.ts`) is extended to accept
an optimistic-update function and forward it to the Convex client, so the vote
control gets Convex-native optimistic updates with automatic settle-time
rollback. This replaces hand-rolled component-local optimism, which would
re-introduce manual reconciliation against incoming query updates.

## Consequences

- Self-voting is allowed; the product rules do not restrict it and no ownership
  model is wired into votes.
- Counts are read twice for page-1 cards (feed item + `cardState`). This
  redundancy is cheap and buys uniform reactivity and optimistic correctness.
- The non-reactive `loadMore` remains as latent tech debt: later-page cards still
  will not reactively reflect _new_ memes or removals (only their own counts via
  `cardState`). Tracked as a follow-up, out of scope for voting.
- Every vote write must go through `castVote` or the denormalized counters drift;
  this is the invariant tests defend.
- This slice introduces the project's first automated-test harness
  (`convex-test` + `vitest`), covering the `castVote` toggle/counter/guard/auth
  matrix.
