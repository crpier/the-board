# Public Feed PRD

Status: draft
Last updated: 2026-04-05

## Problem Statement

The app needs a browse-first entry surface that turns real memes into a scan-friendly public homepage.

Without a dedicated public feed slice, the project mixes browsing concerns with detail-route concerns and makes it harder to implement a focused, verifiable public feed experience.

## Solution

Build a public reverse-chronological feed at `/` backed by real data and linked to the canonical meme detail route.

The slice should render an intentional empty state, support progressive loading, show rich card metadata, stay visually close to `mockups/index-mockup.html`, and mirror the established voting behavior on feed cards.

## User Stories

1. As a guest, I want to browse a public meme feed, so that I can explore content without signing in.
2. As a guest, I want the feed to load progressively as I scroll, so that I can keep browsing without manual pagination.
3. As a guest, I want each feed card to show media, title, tags, vote counts, author, and post time, so that I can quickly evaluate what to open.
4. As a guest, I want an intentional empty state when there are no public memes, so that the app still feels designed.
5. As a guest, I want each feed card to open the canonical detail page for a meme, so that the feed and detail route work together cleanly.
6. As a signed-out visitor, I want to see disabled voting controls on feed cards, so that I understand participation exists and requires sign-in.
7. As an authenticated user, I want to upvote or downvote from the feed, so that I can participate without leaving the browsing surface.
8. As the product team, we want this slice to use real data from the start, so that the app teaches real end-to-end patterns instead of mock-only flows.

## Implementation Decisions

- This slice establishes the public browse-first route at `/`.
- The slice uses real app data from the start.
- Public feed reads return only memes that are both `public` and ready for viewing.
- Feed ordering is reverse chronological.
- The feed supports infinite scroll.
- The feed renders an intentional empty state when no public ready memes exist.
- Feed cards show primary media preview, title when present, tags, aggregate upvote count, aggregate downvote count, author, and post time.
- Each feed card links to the canonical detail route.
- The slice stays visually close to `mockups/index-mockup.html`.
- Feed voting mirrors the established auth and one-active-vote behavior from the meme detail slice.

## Testing Decisions

- Tests should verify externally visible feed behavior rather than internal implementation details.
- The most important coverage areas are public visibility rules, reverse-chronological ordering, empty-state behavior, infinite-scroll behavior, and feed voting behavior.
- Slice verification should cover both route/data behavior and visible UI behavior.
- The slice should be testable with real data reads rather than mock-only flows.

## Out of Scope

- No canonical detail route behavior in this slice.
- No hidden-versus-processing route handling for the detail page.
- No first-time definition of voting rules; this slice reuses the established detail voting behavior.
- No comments, reposts, bookmarks, or social graph features.
- No separate admin page.

## Further Notes

- This slice assumes the canonical detail route already exists and remains the destination when a user opens a meme from the feed.
