# ADR 0013 - User Reporting and an Admin Review Queue at `/admin`

Date: 2026-07-17
Status: accepted

## Context

ADR 0012 deliberately kept moderation to a single mutation (`moderateMeme`)
surfaced inline on `MemeCard`, and stated plainly: "There is no `/admin`
route, review queue, or other console surface." That held as long as the only
moderation trigger was an admin happening to see a meme themselves.

Two upcoming needs break that assumption: users need a way to flag content an
admin hasn't seen (#67), and two future systems — duplicate detection (#58)
and AI moderation (#59) — need somewhere to land findings that aren't tied to
an admin's current scroll position. All three are "review items an admin
works through," not "a control on a card an admin is already looking at."
That shape doesn't fit inline `MemeCard` controls; it needs a queue.

## Decision

**Add a `reports` table and a `/admin` route.** This directly reverses ADR
0012's "no separate admin console" call and the product overview's matching
non-goal — both are updated in this slice.

**Reporting**: any signed-in user can file a report on a meme with a reason
(`spam` / `harassment` / `hate_speech` / `illegal_content` / `other`) and
optional free-text details. One _open_ report per reporter per meme — a
duplicate attempt while the first is still open is rejected, enforced via the
`by_meme_and_reporter_and_status` index rather than a filter scan. A report
requires the meme to be public and ready — the same visibility guard
`castVote` uses — rather than merely un-tombstoned: a missing id, a private
meme, and a meme an admin already hid all throw the identical opaque
not-found error, so a guessed/stale id can't be used to probe a meme's
existence or visibility. One consequence: a meme an admin has already hidden
can no longer be reported, which is fine since it's already hidden.

**The admin queue**: `/admin` lists open reports, oldest first
(`reports.listOpenReports`, backed by a `by_status` index), each resolved to
its reporter's display name and the reported meme's thumbnail/title so an
admin can act without a second lookup. An admin resolves a report by hiding
the meme or dismissing the report (`reports.resolveReport`); hiding reuses
`applyModerationVisibility` — the same core `moderateMeme` calls — as a
same-transaction function call rather than a second `ctx.runMutation`, so the
report and meme updates commit atomically. Resolving is idempotent: acting on
an already-resolved report (a doubled click, or two admins racing) is a
silent no-op, not an error.

**Gating mirrors the existing pattern instead of inventing a new one.**
`/admin` uses the client-side `viewer.current().isAdmin` flag — the same flag
`MemeCard` already reads for `canModerate` — purely as a UX gate (loading vs.
"not found"). Every server function the page calls (`listOpenReports`,
`resolveReport`) independently re-derives admin status via `getViewer` and
throws the same opaque `"Not found."` a non-admin gets everywhere else in the
app; the client-side flag is convenience, not the security boundary.

**Authorization is centralized, not duplicated.** `getViewer` (viewer id +
`isAdmin`) moved from a private helper in `convex/memes.ts` to
`convex/viewer.ts` and is now imported by both `memes.ts` and the new
`convex/reports.ts`, so the admin check can't drift between the two admin
surfaces.

**The page is structured as tabs, with only "Reports" implemented.** `#58`
and `#59` are expected to add their own review-item types as sibling tabs
later; a parallel branch is separately adding admin user management. Neither
is implemented here — this slice is reports only — but the shell (`AdminTab`
union + a `TABS` array) exists so a new tab is additive rather than a rework.

## Consequences

- The product overview's "no separate admin console" non-goal is removed and
  replaced with a description of `/admin` as the review-queue surface;
  `moderateMeme`'s inline card toggle is unchanged and still the fastest path
  for a moderation an admin spots directly.
- `reports` has no `createdAt` field — `_creationTime` already orders every
  document, so a second timestamp would be a redundant copy. `resolvedBy` is
  a real addition (`_creationTime` can't say _who_ resolved something).
- A report against a meme an admin later deletes (or that's since become
  otherwise unavailable) still surfaces in the queue — `memeAvailable: false`
  — so dismiss is always possible, but "hide" is disabled since there's
  nothing left to hide.
- Restoring a hidden meme still has no UI (unchanged from ADR 0012) — hiding
  via the report queue is one-directional, same as the inline toggle.
