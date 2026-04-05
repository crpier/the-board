# Public Feed Tasks

Status: draft
Last updated: 2026-04-05

## Parent PRD

`docs/slices/public-feed/PRD.md`

## Task 1 - Ship the first real public feed path

Status: todo

### What to build

Deliver the first end-to-end public browsing path from real app data to the `/` route. This slice should prove the public visibility rules, render an intentional empty state, and link each rendered item to the canonical meme detail route.

### Acceptance criteria

- [ ] `/` renders from real app data rather than starter placeholder content.
- [ ] The feed shows only memes that are both `public` and ready for viewing.
- [ ] When no public ready memes exist, the route renders an intentional empty state.
- [ ] Each rendered item links to its canonical meme detail route.

### Blocked by

- External dependency: the canonical public detail route from `docs/slices/meme-detail/TASKS.md` should exist before this slice is considered complete.

### User stories addressed

- User story 1
- User story 4
- User story 5
- User story 8

## Task 2 - Enrich public feed cards and ordering

Status: todo

### What to build

Expand the working feed into the intended browse-first experience by adding the required card metadata, primary media preview behavior, and reverse-chronological ordering while staying visually aligned with the mockup direction.

### Acceptance criteria

- [ ] Feed ordering is reverse chronological.
- [ ] Feed cards show the required slice metadata: primary media preview, title when present, tags, aggregate upvote count, aggregate downvote count, author, and post time.
- [ ] The feed remains visually consistent with `mockups/index-mockup.html`.
- [ ] The canonical detail route remains the destination when opening a meme from the feed.

### Blocked by

- Blocked by Task 1

### User stories addressed

- User story 3
- User story 5
- User story 8

## Task 3 - Add infinite scroll to the public feed

Status: todo

### What to build

Turn the enriched feed into a continuous browsing surface with progressive loading. This slice should preserve the established visibility rules and ordering while extending the route to load more content without manual pagination.

### Acceptance criteria

- [ ] The public feed progressively loads additional real items without manual pagination.
- [ ] Newly loaded items continue to respect the same public visibility and ready-state rules.
- [ ] Feed ordering remains reverse chronological across the initial load and subsequent loads.
- [ ] The empty state from Task 1 still appears correctly when no public ready memes exist.

### Blocked by

- Blocked by Task 2

### User stories addressed

- User story 2
- User story 8

## Task 4 - Mirror voting behavior into the feed

Status: todo

### What to build

Extend the established voting behavior into the public feed so feed cards support the same signed-out and authenticated interaction model as the canonical detail route.

### Acceptance criteria

- [ ] Signed-out users see disabled voting controls on feed cards.
- [ ] Authenticated users can upvote and downvote from the feed.
- [ ] Feed cards reflect the same aggregate upvote and downvote state as the detail route.
- [ ] Voting changes made in the feed are reflected correctly when the same meme is opened on the detail route.

### Blocked by

- Blocked by Task 3
- External dependency: auth-aware detail voting from `docs/slices/meme-detail/TASKS.md` should already exist.

### User stories addressed

- User story 6
- User story 7

## Task 5 - Verify public feed behavior end to end

Status: todo

### What to build

Add focused verification for the externally visible behavior promised by this slice. Tests should prove feed behavior, ordering, progressive loading, and voting behavior without depending on shallow internal structure.

### Acceptance criteria

- [ ] Tests cover public feed visibility rules, reverse-chronological ordering, and empty-state behavior.
- [ ] Tests cover infinite-scroll behavior.
- [ ] Tests cover disabled signed-out feed voting controls and authenticated feed voting behavior.
- [ ] Verification covers the feed's integration with the canonical detail route.

### Blocked by

- Blocked by Task 4

### User stories addressed

- User story 1
- User story 2
- User story 3
- User story 4
- User story 5
- User story 6
- User story 7
- User story 8

## Task 6 - Run slice closeout architecture review

Status: todo

### What to build

Run `/improve-codebase-architecture` on the completed slice before considering it closed. Capture accepted refactors in this task list or `docs/ADRs.md`, and keep the slice open until that review is complete or explicitly deferred.

### Acceptance criteria

- [ ] `/improve-codebase-architecture` has been run on the completed slice.
- [ ] Accepted refactors are either completed in this slice or captured as explicit follow-up work.
- [ ] Any accepted cross-cutting decision is recorded in `docs/ADRs.md`.
- [ ] The slice is not marked closed until this review is complete or explicitly deferred.

### Blocked by

- Blocked by Task 5

### User stories addressed

- User story 8

## Slice notes

- This slice assumes the canonical public meme detail route exists and remains the destination when a user opens a meme from the feed.
- The feed should reuse the established detail voting behavior rather than redefining voting rules.
