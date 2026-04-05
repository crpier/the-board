# Meme Detail Tasks

Status: draft
Last updated: 2026-04-05

## Parent PRD

`docs/slices/meme-detail/PRD.md`

## Task 1 - Ship the first real meme detail route

Status: todo

### What to build

Deliver the first end-to-end public detail path at `/meme/[id]` backed by real app data. This slice should prove that a public ready meme can load as a canonical single-item route instead of starter placeholder content.

### Acceptance criteria

- [ ] `/meme/[id]` renders from real app data for a public ready meme.
- [ ] The route shows the meme's primary media and core canonical metadata.
- [ ] The route stays single-item only.

### Blocked by

None - can start immediately.

### User stories addressed

- User story 1
- User story 2
- User story 9

## Task 2 - Enforce public detail visibility and content-state behavior

Status: todo

### What to build

Extend the working detail route so its public behavior matches the documented visibility and lifecycle rules. This slice should make route behavior trustworthy for missing, hidden, and non-viewable processing content.

### Acceptance criteria

- [ ] Nonexistent memes return `404`.
- [ ] Hidden memes return `404` on the public route.
- [ ] A meme that exists but is still processing returns the chosen non-404 response for that state.
- [ ] Public detail access continues to require both public visibility and a ready-for-viewing state.

### Blocked by

- Blocked by Task 1

### User stories addressed

- User story 3
- User story 4
- User story 8

## Task 3 - Add auth-aware voting on meme detail

Status: todo

### What to build

Add the first authenticated participation path on the canonical detail surface. This slice should establish disabled signed-out controls, authenticated voting, aggregate counts, and one-active-vote behavior for a single meme page.

### Acceptance criteria

- [ ] Signed-out users see disabled voting controls on the detail page.
- [ ] Authenticated users can upvote and downvote on the detail page.
- [ ] Each user can hold at most one active vote per meme.
- [ ] The detail page shows aggregate upvote and downvote counts that stay consistent after a vote change.

### Blocked by

- Blocked by Task 2

### User stories addressed

- User story 5
- User story 6
- User story 7

## Task 4 - Verify meme detail behavior end to end

Status: todo

### What to build

Add focused verification for the externally visible behavior promised by this slice. Tests should prove route handling and voting behavior at the detail boundary without depending on shallow internal structure.

### Acceptance criteria

- [ ] Tests cover detail route behavior for public ready, not found, hidden, and processing states.
- [ ] Tests cover disabled signed-out voting controls.
- [ ] Tests cover one-active-vote behavior and aggregate vote count updates.

### Blocked by

- Blocked by Task 3

### User stories addressed

- User story 1
- User story 2
- User story 3
- User story 4
- User story 5
- User story 6
- User story 7
- User story 9

## Task 5 - Run slice closeout architecture review

Status: todo

### What to build

Run `/improve-codebase-architecture` on the completed slice before considering it closed. Capture accepted refactors in this task list or `docs/ADRs.md`, and keep the slice open until that review is complete or explicitly deferred.

### Acceptance criteria

- [ ] `/improve-codebase-architecture` has been run on the completed slice.
- [ ] Accepted refactors are either completed in this slice or captured as explicit follow-up work.
- [ ] Any accepted cross-cutting decision is recorded in `docs/ADRs.md`.
- [ ] The slice is not marked closed until this review is complete or explicitly deferred.

### Blocked by

- Blocked by Task 4

### User stories addressed

- User story 9

## Slice notes

- This slice establishes the canonical public meme route and the core voting behavior.
- Later browse surfaces should reuse this route as the destination for opening a meme.
