# Meme Detail PRD

Status: draft
Last updated: 2026-04-05

## Problem Statement

The app needs a first real public content route that proves a meme can be loaded from real data, displayed as a canonical page, and protected by clear public visibility rules.

Without a dedicated meme detail slice, the project mixes single-item route behavior with feed concerns and makes it harder to implement and verify the canonical destination for a meme.

## Solution

Build a canonical public meme detail page at `/meme/[id]` backed by real data.

The slice should show a meme's primary media and canonical metadata, enforce public visibility and content-state rules, and establish auth-aware voting behavior on the detail surface.

## User Stories

1. As a guest, I want to open a canonical detail page for a meme, so that I can see fuller context for a post.
2. As a guest, I want the detail page to show the meme's primary media and canonical metadata, so that the page feels like the real destination for a post.
3. As a guest, I want hidden memes to behave like not-found content, so that private moderation state is not exposed publicly.
4. As a guest, I want non-viewable processing content to return an appropriate non-404 response, so that route behavior reflects actual content state.
5. As a signed-out visitor, I want to see disabled voting controls, so that I understand participation exists and requires sign-in.
6. As an authenticated user, I want to upvote or downvote a meme, so that I can express preference.
7. As an authenticated user, I want only one active vote per meme, so that voting stays predictable.
8. As an admin, I want moderation to work through visibility changes, so that I can manage content without a separate admin surface.
9. As the product team, we want this slice to use real data from the start, so that the app teaches real end-to-end patterns instead of mock-only flows.

## Implementation Decisions

- This slice establishes the canonical single-meme public route.
- The route is `/meme/[id]`.
- The slice uses real app data from the start.
- Public detail access requires the meme to be both `public` and ready for viewing.
- Hidden memes return `404` on public routes.
- A meme that exists but is still processing returns an appropriate non-404 response for that state.
- The detail route stays single-item only.
- The detail page shows the primary media item, canonical metadata, author, timestamps, tags, aggregate vote counts, and the current viewer's voting state.
- Supported media types are images, GIFs, and videos.
- A meme has one primary media item.
- Title and description are optional.
- Tags are normalized to lowercase alphanumeric-and-dash slugs in both client and backend handling.
- Voting is authenticated-only.
- Signed-out users see disabled voting controls.
- A user can be in exactly one of three vote states for a meme: upvoted, downvoted, or no vote.
- Admin moderation for this slice works by changing visibility.

## Testing Decisions

- Tests should verify externally visible route and interaction behavior rather than internal implementation details.
- The most important coverage areas are detail visibility rules, not-found behavior, processing-state behavior, disabled signed-out voting controls, and one-active-vote behavior.
- Slice verification should cover both route/data behavior and visible UI behavior.
- The slice should be testable with real data reads rather than mock-only flows.

## Out of Scope

- No public feed route in this slice.
- No feed card rendering, feed ordering, or infinite scroll.
- No voting controls on feed cards.
- No adjacent next/previous meme navigation.
- No comments, reposts, bookmarks, or social graph features.
- No separate admin page.

## Further Notes

- Public detail pages may later link to author profiles once profile editing exists, but plain-text author display is enough for this slice.
