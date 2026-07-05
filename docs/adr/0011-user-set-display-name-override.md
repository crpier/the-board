# ADR 0011 - User-Set Display Name as an Override Field

Date: 2026-07-05
Status: accepted

## Context

Profile editing (#57) needs a user-settable display name. The obvious move —
patching `users.name` — is a trap: `@convex-dev/auth` (Google provider, no
profile override in `convex/auth.ts`) re-persists the OAuth profile's `name`
and `image` onto the user document on **every sign-in**. A user-chosen value
written to `users.name` would silently revert to the Google profile name the
next time the user logs in.

Attribution already resolves the author name live at read time (ADR 0006), so
whatever field holds the display name propagates to feed, detail, and search
with no backfill.

## Decision

The user-set display name lives in its own field, `users.displayName`, as an
**override** of the OAuth-managed `name`:

- `name` stays provider-owned and is expected to be rewritten on each sign-in;
  the app never writes it.
- `displayName` is written only by the viewer-scoped `updateDisplayName`
  mutation (identity derived server-side, per ADR 0009; trimmed, capped at
  `MAX_DISPLAY_NAME_LENGTH`). A blank submission clears the field entirely
  (patch to `undefined`), the same blank-clears convention as meme titles.
- Display resolution everywhere is `displayName ?? name ?? "Anon"` — in
  `viewer.current` and in the meme view-model's `authorName`.

## Consequences

- A user's chosen name survives re-login; clearing it reverts attribution to
  the live Google profile name.
- Every surface that renders a user name must use the two-step fallback, not
  `name` directly. The meme view-model centralizes this for attribution;
  future surfaces must remember it.
- Renames propagate immediately with no backfill, inherited from ADR 0006's
  read-time resolution.
