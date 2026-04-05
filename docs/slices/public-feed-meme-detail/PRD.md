# Public Feed + Meme Detail PRD

Status: draft
Last updated: 2026-04-04

## Problem Statement

The project needs its first real product slice: a public browsing experience that turns the starter scaffold into a real app with actual data, clear visibility rules, and auth-aware participation.

Without a public feed and canonical meme detail page, the app cannot yet demonstrate its core browsing model, visual direction, or key product rules around voting, visibility, and moderation.

## Solution

Build a public reverse-chronological feed and a canonical meme detail page backed by real Convex data.

The slice should preserve the visual direction of `mockups/index-mockup.html`, support images, GIFs, and videos in the content model, keep hidden memes inaccessible on public routes, and expose voting as an authenticated interaction with disabled controls for signed-out users.

## User Stories

1. As a guest, I want to browse a public meme feed, so that I can explore content without signing in.
2. As a guest, I want the feed to load progressively as I scroll, so that I can keep browsing without manual pagination.
3. As a guest, I want each feed card to show media, title, tags, vote counts, author, and post time, so that I can quickly evaluate what to open.
4. As a guest, I want an intentional empty state when there are no public memes, so that the app still feels designed.
5. As a guest, I want to open a canonical detail page for a meme, so that I can see fuller context for a post.
6. As a guest, I want hidden memes to behave like not-found content, so that private moderation state is not exposed publicly.
7. As a guest, I want non-viewable processing content to return an appropriate non-404 response, so that route behavior reflects actual content state.
8. As a signed-out visitor, I want to see disabled voting controls, so that I understand participation exists and requires sign-in.
9. As an authenticated user, I want to upvote or downvote a meme, so that I can express preference.
10. As an authenticated user, I want only one active vote per meme, so that voting stays predictable.
11. As an admin, I want moderation to work through visibility changes, so that I can manage content without a separate admin surface.
12. As the product team, we want this slice to use real Convex-backed data from the start, so that the app teaches real end-to-end patterns instead of mock-only flows.

## Implementation Decisions

- This is the first real product slice in the app.
- The slice uses real Convex-backed data from the start.
- The slice stays visually close to `mockups/index-mockup.html`.
- Visibility and status are separate concepts.
- Public routes only show memes with public visibility and a ready-for-viewing status.
- Hidden memes return `404` on public routes.
- The detail route remains single-item only.
- Supported media types are images, GIFs, and videos.
- A meme has one primary media item.
- Title and description are optional.
- Tags are normalized to lowercase alphanumeric-and-dash slugs in both client and backend handling.
- Media optimization is required before publish.
- Recommended upload thresholds are 10 MB for images, 25 MB for GIFs, and 100 MB for video input, with video compressed toward roughly 25 MB output when practical.
- Duplicate findings warn uploaders and admins and create review items, but do not block publish or hide memes.
- Admin moderation for this slice works by changing visibility.
- AI moderation may run after publish and auto-hide a meme by changing visibility to `hidden` until reviewed.
- Voting is authenticated-only.
- A user can be in exactly one of three vote states for a meme: upvoted, downvoted, or no vote.

## Testing Decisions

- Tests should verify externally visible slice behavior rather than internal implementation details.
- The most important coverage areas are feed visibility rules, detail visibility rules, reverse-chronological feed behavior, disabled signed-out voting controls, and one-active-vote behavior.
- Slice verification should cover both UI behavior and route/data behavior.
- The slice should be testable with real Convex-backed reads rather than mock-only data flows.

## Non-goals

- No comments, reposts, bookmarks, or social graph features in this slice.
- No adjacent next/previous meme navigation on detail.
- No public duplicate-warning UI.
- No separate admin page.

## Primary users

- Guest: browses the public feed and public meme detail pages.
- Authenticated user: can vote on memes.
- Admin: can moderate by changing visibility.

## Experience

### Public feed

- Route: `/`
- Publicly accessible without sign-in.
- Infinite scroll.
- Reverse chronological ordering.
- Intentional empty state when no public memes exist yet.
- Feed cards should show:
  - primary media preview
  - title when present
  - tags
  - upvote count
  - downvote count
  - author
  - post time

### Meme detail

- Route: `/meme/[id]`
- Publicly accessible only when the meme visibility is `public` and status is viewable.
- Shows the primary media item, canonical metadata, author, timestamps, tags, and voting state.
- The detail page is the canonical destination when a user opens a meme from the feed.
- If the meme does not exist, return `404`.
- If the meme exists but is hidden from the current user, return `404`.
- If the meme exists but is not viewable because it is still processing, return an appropriate non-404 HTTP status for that state.
- Detail stays single-item only.

## Content and media rules

- Each meme has one primary media item.
- Supported media types are images, GIFs, and videos.
- Title is optional.
- Description is optional.
- Tags are normalized to lowercase alphanumeric-and-dash slugs in both client and backend handling.
- Media optimization is required before publish.
- If optimization fails, publish must fail rather than silently uploading the unoptimized original.
- Recommended upload thresholds are 10 MB for images, 25 MB for GIFs, and 100 MB for video input, with video compressed toward roughly 25 MB output when practical.
- Duplicate findings may warn uploaders and admins and create review items, but do not block publish or hide memes.

## Visibility, status, and moderation

Visibility and status are separate concepts.

- Required visibility values for this slice:
  - `public`
  - `hidden`
- Required status values for this slice:
  - `draft`
  - `processing`
  - `ready`
  - `failed`
  - `deleted`

Rules:

- Feed and detail only show memes that are viewable to the current user.
- Public routes should only show memes with public visibility and a ready-for-viewing status.
- Admin moderation for this slice works by changing visibility.
- AI moderation may run after publish and auto-hide a meme by changing visibility to `hidden` until reviewed.

## Voting and auth

- Voting is authenticated-only.
- Signed-out users see disabled voting controls.
- One active vote per user per meme.
- A user can be in exactly one of three states for a meme: upvoted, downvoted, or no vote.
- Feed and detail should both surface aggregate upvotes and downvotes.
- Signed-out users can browse public content without authentication.

## Acceptance criteria

- The app has a real public feed route backed by Convex data.
- The app has a real meme detail route backed by Convex data.
- The feed uses infinite scroll and reverse chronological ordering.
- The feed empty state is intentional and designed, not a placeholder.
- Feed cards show the required metadata and primary media preview.
- Public visibility rules are respected on both feed and detail pages.
- Hidden memes return `404` on public routes.
- Voting requires auth and enforces one active vote per user per meme.
- Signed-out users see disabled voting controls.
- Images, GIFs, and videos are supported in the content model.
- Media optimization is required before publish.
- Duplicate handling warns but does not block publish or auto-hide.
- Simple admin moderation can hide content through visibility changes.
- The slice still reflects the visual direction of `mockups/index-mockup.html`.

## Further Notes

- Should public detail pages expose author profiles once profile editing exists, or remain plain text only at first?
