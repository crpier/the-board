# Public Feed + Meme Detail Tasks

Status: draft
Last updated: 2026-04-04

## Parent PRD

`docs/slices/public-feed-meme-detail/PRD.md`

## Task 1 - Establish public meme read models

Status: todo

### What to build

Define the real Convex-backed read shape needed to power the public feed and meme detail routes, including visibility and status filtering.

### Acceptance criteria

- [ ] Feed reads return only public, ready-for-viewing memes.
- [ ] Detail reads distinguish not found, hidden, and non-viewable processing states.
- [ ] The returned shape supports media preview, title, tags, vote counts, author, and post time.

### Blocked by

None - can start immediately.

### User stories addressed

- User stories 1, 3, 5, 6, 7, 12

## Task 2 - Build the public feed route

Status: todo

### What to build

Implement the public feed route as a real reverse-chronological browsing surface with infinite scroll and an intentional empty state.

### Acceptance criteria

- [ ] `/` renders real data from Convex.
- [ ] Feed ordering is reverse chronological.
- [ ] Infinite scroll works for the public feed.
- [ ] The empty state is intentional and designed.
- [ ] Feed cards show media preview, title, tags, vote counts, author, and post time.

### Blocked by

- Blocked by Task 1

### User stories addressed

- User stories 1, 2, 3, 4, 12

## Task 3 - Build the meme detail route

Status: todo

### What to build

Implement the canonical meme detail route with the required content state handling and public visibility behavior.

### Acceptance criteria

- [ ] `/meme/[id]` renders real data from Convex.
- [ ] Nonexistent memes return `404`.
- [ ] Hidden memes return `404`.
- [ ] Processing memes return the chosen non-404 response for that state.
- [ ] Detail remains single-item only.

### Blocked by

- Blocked by Task 1

### User stories addressed

- User stories 5, 6, 7, 12

## Task 4 - Add auth-aware voting

Status: todo

### What to build

Add voting to feed and detail with disabled signed-out controls and one active vote per user per meme.

### Acceptance criteria

- [ ] Signed-out users see disabled voting controls.
- [ ] Authenticated users can upvote and downvote.
- [ ] Each user has at most one active vote per meme.
- [ ] Feed and detail surfaces stay in sync with aggregate vote counts.

### Blocked by

- Blocked by Task 1
- Blocked by Task 2
- Blocked by Task 3

### User stories addressed

- User stories 8, 9, 10

## Task 5 - Verify the slice with tests

Status: todo

### What to build

Add test coverage and verification for the public feed, meme detail, and voting behavior described in the PRD.

### Acceptance criteria

- [ ] Tests cover feed visibility rules and reverse-chronological behavior.
- [ ] Tests cover detail route behavior for not found, hidden, and processing states.
- [ ] Tests cover disabled signed-out voting controls and one-active-vote behavior.

### Blocked by

- Blocked by Task 2
- Blocked by Task 3
- Blocked by Task 4

### User stories addressed

- User stories 1 through 10, 12

## Task 6 - Run post-implementation architecture review

Status: todo

### What to build

Run `/improve-codebase-architecture` after the slice is implemented to identify structural improvements before the slice is considered closed.

### Acceptance criteria

- [ ] `/improve-codebase-architecture` has been run on the completed slice.
- [ ] Accepted refactors are either completed in this slice or explicitly deferred.
- [ ] Any accepted cross-cutting decision is recorded in `docs/ADRs.md`.
- [ ] The slice is not marked closed until this review is complete or explicitly deferred.

### Blocked by

- Blocked by Task 5

### User stories addressed

- User stories 12

## Slice notes

- `SolidStart` + `SolidJS` + `TypeScript` scaffold is in place.
- The app still uses starter routes and placeholder content.
- Convex exists as a starter function directory with a placeholder query.
- Auth, schema, `R2`, AI, Tailwind, tests, and deployment wiring are not implemented yet.

## Verification checklist

- Auth: guest sees only public memes; Google sign-in works through Convex auth; first user becomes admin
- Permissions: users cannot view hidden memes; users cannot view processing memes; owner can delete own meme; admin can delete any meme
- Feed: public feed infinite-scrolls in reverse chronological order and empty state renders intentionally
- Media: image, GIF, and video upload works; videos are optimized before upload; failed optimization blocks publish; `R2` asset references are stored correctly
- Search: results match title, OCR, transcript, tags, categories, and alt text, support planned filters, and respect visibility rules
- Duplicates: duplicate findings are visible to uploader and admin; uploader cannot override them directly; duplicate findings do not block publish
- Deploy: Convex dev and prod deployments are separated, and Cloudflare preview is added after the local slice works
