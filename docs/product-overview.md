# Product Overview

## Product summary

`the-board` is a browse-first meme app for public media posts with lightweight social interaction, simple admin moderation, and a strong visual identity.

The product should let guests browse public content immediately, let authenticated users participate through voting and later ownership flows, and keep the core rules understandable even as the system behind them grows more capable.

## Working principles

- Prefer clarity over maximum speed or cleverness.
- Use AI to implement the work, reviewed and refined before it merges.
- Build in small vertical slices, not broad horizontal layers.
- Prefer short decision notes over long speculative planning.
- When stuck, choose the smallest end-to-end step that moves the slice forward.
- After each meaningful step, write down what changed and what comes next.
- Prefer client-side rendering backed directly by Convex over adding a separate server-side rendering backend.

## Users

- Guest: browses public memes and public meme detail pages.
- User: browses, votes, uploads, and manages their own memes.
- Admin: moderates content and reviews system findings without needing a separate admin product surface.

## Core experience

- Browsing public memes should work without signing in.
- Public browsing may show a short client-side loading state before feed data appears.
- The feed should feel rich, scan-friendly, and metadata-heavy rather than toy-like.
- Opening a meme should lead to a canonical detail page with fuller context.
- Signed-out users should clearly see that participation exists, even when controls are disabled.
- Moderation should feel simple for admins, even if the system behind it becomes more sophisticated.

## Functional requirements

### Content

- A meme has one primary media item.
- Supported media types are images, GIFs, and videos.
- Title is optional.
- Description is optional.
- Tags are normalized and reusable.
- Canonical user-authored metadata remains distinct from AI-generated suggestions.

### Discovery

- Guests can browse public memes without an account.
- Public meme browsing centers on a reverse-chronological feed.
- A meme detail page exists as the canonical destination for an individual meme.
- Search should cover text metadata and support filters such as tags and media type.
- Tags should be clickable and usable as a discovery tool.

### Interaction

- Voting requires authentication.
- Signed-out users see disabled voting controls.
- Each user can hold one active vote per meme: upvote, downvote, or no vote.
- Feed and detail surfaces show aggregate upvote and downvote counts.

### Ownership

- Authenticated users can upload memes.
- Authenticated users can edit metadata for their own memes.
- Authenticated users can delete their own memes.
- Users can edit their profile.

## Visibility, lifecycle, and moderation

- Visibility and lifecycle are separate concepts.
- Visibility controls who can see a meme.
- Lifecycle status controls whether a meme is draft, processing, ready, failed, or deleted.
- Public browsing only shows memes that are both public and ready.
- Hidden memes should appear as not found on public routes.
- Admin moderation stays simple at the product surface: admins change a meme's visibility.
- AI moderation may run after publish and hide content until an admin restores it.

## Duplicate detection

- Duplicate detection is flag-not-block.
- Duplicate findings create warnings and review items.
- Duplicate findings do not block publish.
- Duplicate findings do not automatically hide memes.
- Duplicate warnings follow the same visibility rule everywhere: uploader and admin only.

## Media requirements

- Media optimization is required before publish.
- If optimization fails, publish fails.
- Recommended thresholds for implementation are:
- images up to 10 MB input
- GIFs up to 25 MB input
- videos up to 100 MB input, compressed toward roughly 25 MB output when practical

## Permissions

- Guests can browse public, ready memes only.
- Users can interact with their own content and participate through voting.
- The first registered user becomes admin automatically.
- Admins can moderate any meme through visibility changes and review system findings in the normal UI.

## Design principles

- Match the tone and information density of `mockups/index-mockup.html` closely.
- Keep the interface bold, high-contrast, and slightly cyberpunk while staying usable.
- Prefer interfaces that make the product feel real and content-rich.
- Avoid showing removed concepts such as a `special` tier.

## Non-goals

- No `special` tier.
- No separate admin console as a primary product surface.
- No comments, reposts, bookmarks, or social-graph features as core requirements.
- No managed video streaming service as part of the core product.
- No groups or community segmentation requirements.

## Open product questions

- How much of search belongs in the first browse experience versus later discovery work?
- When should duplicate detection expand from exact matching into perceptual and AI-assisted analysis?

## Resolved product questions

- Sign-in prompts around disabled participation controls stay subtle: voting
  controls render visibly disabled with aggregate counts still shown, and a
  lightweight "Sign in to vote" affordance appears on interaction — no modal or
  redirect. Resolved in the Voting slice; may be escalated later if participation
  is too easy to miss.
