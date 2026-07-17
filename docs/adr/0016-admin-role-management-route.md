# ADR 0016 - Admin Role Management via a Dedicated `/admin/users` Route

Date: 2026-07-17
Status: accepted

## Context

Only the first-ever registered user is auto-promoted to admin
(`convex/auth.ts`); there was no code path to grant admin to anyone else.
That's a single point of failure — losing access to that one account (or
simply wanting a second admin) had no in-product remedy.

ADR 0012 decided admin moderation has "no `/admin` route, review queue, or
other console surface" and folded it into the normal meme UI, because
moderation there is a single field change on content the admin can already
see. Role management doesn't fit that shape: it operates over the `users`
table, not memes, has no natural home on an existing page, and needs its own
list/roster UI. A separate admin console was also called out as a non-goal in
the product overview.

Separately, a reports queue is being built at `/admin` in parallel on another
branch. Landing both slices on a shared `/admin` page at the same time would
force the two branches to coordinate on one file's layout for no shared
benefit — the two features don't interact.

## Decision

**Role management gets its own self-contained route, `/admin/users`, not a
shared `/admin` landing page.** It has its own admin guard (same shape as
every other hidden-resource case in the product: a non-admin, including a
guest, sees the same "this page doesn't exist" treatment used elsewhere,
never a distinguishable "forbidden"). This keeps it decoupled from whatever
else ends up under `/admin` (the reports queue) and matches the existing
opaque-denial convention (ADR 0012, `getMeme`, `requireOwnedMeme`).

**The non-goal changes shape rather than disappearing.** "No separate admin
console" is replaced by "no _unified_ admin dashboard" — admin capabilities
live in small, purpose-specific routes instead of one general-purpose
console. `/admin/users` is the first of these; the reports queue will be
another.

**Authorization is a shared helper, not a copy.** The admin check
(`getViewer`/`requireAdmin`) moved out of `convex/memes.ts` (where ADR 0012
introduced it) into `convex/authz.ts`, so `moderateMeme` and the new
`users.ts` mutations/queries share one implementation instead of drifting.
Unlike `moderateMeme`'s opaque "Meme not found." (which hides whether a specific
meme exists from a non-admin), `requireAdmin` throws a plain "Admin access
required." — there's no meme-like existence to hide on an admin-only roster
endpoint.

**The last admin can't be demoted, enforced in the mutation.** `demoteUser`
counts admins via the `by_isAdmin` index bounded to `.take(2)` (never an
unbounded `.collect()`): fewer than two means the target — already confirmed
admin — is the only one, and the mutation throws instead of patching. This is
a server-side invariant, not a UI-only disabled button; the UI additionally
surfaces the server's error message inline when it fires.

## Consequences

- Two admin routes now exist (`/admin/users` here, `/admin` for reports on
  another branch) with no shared layout, nav shell, or landing page. If a
  unified admin shell becomes worth building later, it can wrap both without
  either needing to change internally.
- `convex/authz.ts` is now the single source of truth for "who is the viewer
  and are they an admin," used by both meme moderation and user role
  management. Any future admin-gated surface should use `requireAdmin` rather
  than re-deriving `isAdmin` locally.
- Promoting is intentionally unrestricted among admins (any admin can promote
  anyone), and idempotent. There's no "super-admin" tier and no approval
  workflow — matches the product's stated preference for simple moderation
  over sophisticated process.
