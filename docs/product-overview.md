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
- Admin: moderates content directly on flagged memes, reviews open reports and system findings in the `/admin` review queue, and manages who else holds the admin role via `/admin/users`.

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
- The nav also has a "Random" action, open to everyone. Clicking it lands on a
  random public, ready meme's detail page; repeated clicks vary; a private,
  hidden, or not-yet-ready meme is never a possible result. If there are no
  public memes yet, it shows a small inline message instead of navigating
  (ADR 0014).

### Sharing

- A share/copy-link action is available on both the feed card and the meme
  detail page. It prefers the OS share sheet (`navigator.share`) when
  available and otherwise copies the link to the clipboard, with inline
  "Copied!" feedback.
- Pasting a meme link into Discord, Slack, WhatsApp, or Twitter unfurls it: a
  public, ready meme shows its title and image (video memes show title only,
  no thumbnail); every other case (private, hidden, not-yet-ready, deleted, or
  an unknown id) unfurls with a generic "The Board" title and no image, never
  revealing whether the meme exists — the same not-found rule the detail page
  itself follows.
- The link a user copies/shares is not the bare app URL: the app is
  client-side rendered (ADR 0002) and never server-renders `/meme/:id`, so
  unfurl bots (which fetch a URL but don't run JavaScript) need a
  server-rendered response elsewhere. That response is served by a Convex http
  action (ADR 0015); opening the link redirects a human to the real app page
  immediately.

### Interaction

- Voting requires authentication.
- Signed-out users see disabled voting controls.
- Each user can hold one active vote per meme: upvote, downvote, or no vote.
- Feed and detail surfaces show aggregate upvote and downvote counts.
- Reporting requires authentication. A signed-in user can report a meme with a
  reason (spam, harassment, hate speech, illegal content, or other) and
  optional details.
- A meme can only be reported while it is public and ready, the same
  visibility guard as voting; a missing id, a private meme, and a meme an
  admin already hid all resolve to the same not-found error, never revealing
  whether the meme exists.
- A user can hold at most one open report per meme; a second report while the
  first is still open is rejected. They may report again once that report is
  resolved or dismissed.

### Ownership

- Authenticated users can upload memes.
- Authenticated users can edit metadata for their own memes.
- Authenticated users can delete their own memes. Delete asks for confirmation
  through an in-app modal, never a browser `confirm()`.
- A deleted meme is immediately hidden everywhere (feed, profile, search,
  detail) but stays restorable for a fixed undo window (currently 24 hours)
  before its media is permanently reclaimed. The owner can undo a delete from
  the confirmation toast shown right after deleting.
- Media storage cleanup is eventually consistent: a background sweep runs
  every few hours and removes any stored media object that no longer belongs
  to a live meme or a live template (including one reclaimed past its undo
  window), catching cases where the normal reclaim step failed to finish.
  Memes and templates share one media store, so the sweep keeps any object
  still claimed by a live meme or template and only reclaims true orphans.
  This is invisible to users and does not change when a deleted item's undo
  window closes.
- Users can edit their profile display name from the settings page; other
  profile fields (email, avatar) stay managed by the auth provider.

### Meme creator and templates

- Signed-in users can make a meme in-app at `/create` (linked from the nav and
  from the template picker); guests are sent to sign in, the same as uploading.
- The base image is either a local static image or a Template picked from the
  library. GIFs and videos are rejected in the creator with a clear message —
  captioning them is out of scope, and a canvas would silently freeze the first
  frame.
- Captions are free-positioned text boxes: add several, drag each anywhere, and
  resize a box to scale its font. Styling is fixed to the classic meme look
  (bold white fill, black outline, one bundled font) with no other controls —
  no colours, rotation, crop, stickers, or drawing. The editor preview matches
  the exported image exactly.
- "Copy image" copies the finished meme to the clipboard (as a PNG) without
  publishing. Publishing re-encodes the image and goes through the exact same
  title/tags/visibility form and pipeline as a normal upload — a created meme is
  indistinguishable from an uploaded one (no provenance, no remix; see ADR
  0020).
- A Template is a reusable base image in a shared library, distinct from a meme:
  it has no votes and no feed presence, and is always public. Any signed-in user
  can contribute one by opting in — a "save this image as a template" checkbox
  with a required name — while publishing a meme from their own local image.
- The library launches empty (no seeded classics) and is browsed as a
  newest-first grid with name search; there are no tags, categories, or
  popularity ranking in v1 (a created meme is never linked back to its base, so
  usage can't be ranked).
- Templates reuse the meme lifecycle: an owner can delete their own Template
  with the standard undo window, an admin can remove any Template (also with
  undo), any signed-in user can report a Template, and its media is reclaimed on
  the same delayed schedule as a meme's.
- A meme publish and a Template save are independent outcomes: the creator
  reports success or failure for each separately, so one failing doesn't
  obscure the other.

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
- Admins have two moderation entry points: the inline visibility toggle on a
  meme they're already looking at (`MemeCard`, ADR 0012), and the `/admin`
  review queue (ADR 0018) for reports and future findings that aren't tied to
  an admin's current scroll position.
- The `/admin` review queue lists open reports, oldest first, each resolved
  to the reporter's name and the reported item's preview. A report targets a
  meme or a Template; the queue moderates both in one place. An admin resolves
  a report by hiding the reported item (hiding a meme is a visibility change,
  the same as the inline toggle; hiding a Template removes it from the library
  with the standard undo window) or dismissing it with no change; resolving is
  final — there is no reopen path.
- `/admin` is admin-only; every other viewer (guest or signed-in non-admin)
  gets the same not-found treatment as any other hidden route.

## House rules

- Users must only post content they have the right to share.
- Illegal content, harassment, and hate speech are not allowed.
- Don't spam the feed with duplicate or repeated posts.
- Admin visibility decisions are final within the product surface.
- The `/about` page is the canonical place these rules are presented to users.
- These rules are enforced today through manual admin visibility moderation,
  either directly on a meme or by resolving a user report in the `/admin`
  queue; automated duplicate detection and AI moderation are planned (see the
  Duplicate detection section and Open product questions) and are not yet
  live, so `/about` must not describe them as active.

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
- Users can interact with their own content and participate through voting
  and reporting.
- The first registered user becomes admin automatically.
- Admins can moderate any meme through visibility changes, either inline on
  the meme or by resolving a report in the `/admin` queue, and review system
  findings there too. Admins can also remove any Template from the library
  (a soft delete with the standard undo window), inline or via a report.
- Admins can promote any user to admin, and demote an admin back to a regular
  user, from the user role management surface (`/admin/users`).
- The last remaining admin can't be demoted — enforced server-side, not just
  hidden in the UI — so the product can never end up with zero admins able to
  grant admin to anyone else.

## Rate limiting

- Uploading (including saving a Template, which is an upload), voting, and
  editing are rate-limited per user to prevent a single account from hammering
  the backend (scripted spam, vote-brigading, etc.).
- Limits are generous enough that normal use never hits them: roughly 10
  uploads/hour, 60 votes/minute, and 30 edits/hour (see
  `docs/adr/0017-rate-limiting.md` for the exact configuration and rationale).
- Hitting a limit does not lose the user's input: the form/action stays in
  place and shows a friendly "try again in Xs" message rather than a raw
  error.
- Deleting, reporting, and admin moderation are not rate-limited today.

## Design principles

- Match the tone and information density of `mockups/index-mockup.html` closely.
- Keep the interface bold, high-contrast, and slightly cyberpunk while staying usable.
- Prefer interfaces that make the product feel real and content-rich.
- Avoid showing removed concepts such as a `special` tier.

## Non-goals

- No `special` tier.
- No unified admin dashboard as a primary product surface — admin
  capabilities live in small, purpose-specific routes: the `/admin` review
  queue (reports today; see ADR 0018) and `/admin/users` for role management,
  rather than one general-purpose admin console.
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
- Whether moderation ever needs a dedicated console beyond the inline
  visibility toggle: yes, once findings (user reports, and later duplicate
  detection and AI moderation) aren't tied to an admin's current scroll
  position, they need a queue. `/admin` is scoped to that review-queue job
  only, not general admin tooling. Resolved in the Reporting + Admin Queue
  slice (ADR 0018), reversing ADR 0012's original "no console" call.
