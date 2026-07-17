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
- Tags are canonicalized and reusable.
- Canonical user-authored metadata remains distinct from AI-generated suggestions.
- A meme is attributed to its author by their current display name; renaming a
  profile updates the attribution everywhere, with no stored copy to backfill.

### Discovery

- Guests can browse public memes without an account.
- Public meme browsing centers on a reverse-chronological feed.
- A meme detail page exists as the canonical destination for an individual meme.
- The feed links out to the meme detail page through each card's timestamp and title;
  media is not the link target.
- Each post's author name links to that author's profile page.
- A profile page shows that user's ready posts in reverse-chronological publish
  order. Other viewers see only public posts; the profile owner also sees their
  own private ready posts.
- The nav has a plain link to the search page; search is open to everyone.
- Anyone — signed in or not — can search public, ready memes by a query that
  matches a meme's title and its tags together, ranked by relevance.
- Media type (image / GIF / video) refines an active search; it is not a
  standalone browse axis, since a search always carries query text.
- Search never reveals memes a viewer can't otherwise see: `private`,
  not-yet-`ready`, and deleted memes never appear — including an owner's own
  `private` memes.
- Tags are a discovery tool: a meme's tags are searchable terms, and each tag on
  a card is clickable, running a search (`/search?q=<tag>`) for that tag in the
  feed, on the detail page, and within results alike.

### Interaction

- Voting requires authentication.
- Signed-out users see disabled voting controls.
- Each user can hold one active vote per meme: upvote, downvote, or no vote.
- Feed and detail surfaces show aggregate upvote and downvote counts.

### Ownership

- Authenticated users can upload memes.
- Authenticated users can edit metadata for their own memes.
- Authenticated users can delete their own memes.
- Users can edit their profile display name from the settings page; other
  profile fields (email, avatar) stay managed by the auth provider.

## Visibility, lifecycle, and moderation

- Visibility and lifecycle are separate concepts.
- Visibility controls who can see a meme.
- Lifecycle status controls whether a meme is draft, processing, ready, failed, or deleted.
- Public browsing only shows memes that are both public and ready.
- Hidden memes should appear as not found on public routes.
- The meme detail page is governed by the same rules: anyone can open a public,
  ready meme, an owner can additionally open their own ready meme when it is
  private, and every other case (deleted, not-yet-ready, hidden, someone else's
  private meme, or an unknown id) is an identical not-found that never reveals
  whether the meme exists. Admins get no special detail access here.
- Admin moderation stays simple at the product surface: admins change a meme's visibility.
- AI moderation may run after publish and hide content until an admin restores it.

## House rules

- Users must only post content they have the right to share.
- Illegal content, harassment, and hate speech are not allowed.
- Don't spam the feed with duplicate or repeated posts.
- Admin visibility decisions are final within the product surface.
- The `/about` page is the canonical place these rules are presented to users.
- These rules are enforced today only through manual admin visibility
  moderation; automated duplicate detection and AI moderation are planned
  (see the Duplicate detection section and Open product questions) and are
  not yet live, so `/about` must not describe them as active.

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

## Rate limiting

- Uploading, voting, and editing are rate-limited per user to prevent a single
  account from hammering the backend (scripted spam, vote-brigading, etc.).
- Limits are generous enough that normal use never hits them: roughly 10
  uploads/hour, 60 votes/minute, and 30 edits/hour (see
  `docs/adr/0013-rate-limiting.md` for the exact configuration and rationale).
- Hitting a limit does not lose the user's input: the form/action stays in
  place and shows a friendly "try again in Xs" message rather than a raw
  error.
- Deleting and admin moderation are not rate-limited today.

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

- When should duplicate detection expand from exact matching into perceptual and AI-assisted analysis?

## Resolved product questions

- Sign-in prompts around disabled participation controls stay subtle: voting
  controls render visibly disabled with aggregate counts still shown, and a
  lightweight "Sign in to vote" tooltip surfaces on the controls — clicking does
  nothing, with no modal or redirect. Resolved in the Voting slice; may be
  escalated later if participation is too easy to miss.
- How much of search belongs in the first browse experience: search is a single
  relevance mode over a meme's title + tags, with media type as a refinement and
  no recency/browse-only path. Tag browsing is therefore relevance-ordered, not
  chronological. Resolved in the Faceted Search epic (ADR 0010).
