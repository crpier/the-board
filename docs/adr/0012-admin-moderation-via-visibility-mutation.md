# ADR 0012 - Admin Moderation as a Visibility Mutation in the Normal UI

Date: 2026-07-05
Status: partially superseded by [ADR 0018](0018-user-reporting-and-admin-review-queue.md) —
the "no `/admin` route, review queue, or other console surface" call below no
longer holds once reports need somewhere to land. The rest of this record
(the `moderateMeme` mutation, its opaque-denial shape, and the inline
`MemeCard` toggle) is unchanged and still the primary moderation path for a
meme an admin is already looking at.

## Context

The product overview promises: "Admins can moderate any meme through visibility
changes and review system findings in the normal UI", and lists "no separate
admin console as a primary product surface" as a non-goal. The auth foundation
already promotes the first registered user to admin (`users.isAdmin`, set in
`convex/auth.ts`), but until #56 nothing used the flag: the only visibility
mutation (`updateMeme`) is owner-only (ADR-0009).

Two durable questions needed answering:

- **Where does admin moderation live in the product?** A dedicated admin
  route/console, or an action surfaced on the memes admins already see?
- **What does a denied moderation attempt look like?** An explicit "forbidden",
  or the same opaque not-found the rest of the meme API uses?

## Decision

**Moderation is a single mutation, `moderateMeme`, surfaced in the normal UI.**
It changes exactly one field — `visibility` — on any non-deleted meme,
regardless of ownership. The client renders a small shield-marked
public/private toggle on `MemeCard` (feed, search, detail) when the
server-computed `canModerate` flag is set and the viewer is not the owner
(owners already have a visibility toggle in their edit form). There is no
`/admin` route, review queue, or other console surface.

**Denial is the opaque not-found.** Every failure — guest, non-admin, missing
meme, tombstoned meme — throws the same `"Meme not found."` that
`requireOwnedMeme` throws (ADR-0009), so the mutation never confirms to a
non-admin that a meme id exists. This deliberately matches the hidden-meme
handling everywhere else (`getMeme` returns the same `null` for every hidden
case) instead of introducing a distinguishable "forbidden".

**Admin status is server-derived and read-scoped.** The mutation re-derives the
viewer via `getAuthUserId` and reads `isAdmin` from their user doc — never from
an argument. The view-model gains a viewer-relative `canModerate: boolean`
(alongside ADR-0009's `isOwner`), which is purely a UI gate: **no query widens
what an admin can see.** Feed, search, and detail keep their static
public+ready filters; "admins get no special detail access" still holds.

## Consequences

- The moderation surface is exactly the set of memes an admin can already see:
  public memes everywhere, plus their own private memes on detail. An admin can
  hide a public meme from anywhere, but cannot _see_ someone else's private
  meme to restore it — restore-after-hide needs a future read surface (the
  review-findings list already contemplated by the product overview) and is out
  of scope here, as is the AI-moderation restore flow.
- Server-side there is no owner exclusion: an admin moderating their own meme
  is allowed and equivalent to editing it. The UI hides the moderation toggle
  on owned cards only to avoid two visibility controls.
- The opaque denial keeps the API's existence-hiding property uniform, at the
  usual cost: a signed-in non-admin poking the API gets "not found" for a meme
  they can literally see. That trade was already made for `requireOwnedMeme`.
- `canModerate` costs one extra `ctx.db.get(viewerId)` per feed-shaped query
  (not per meme), shared with the `isOwner` identity read via a single
  `getViewer` helper.
