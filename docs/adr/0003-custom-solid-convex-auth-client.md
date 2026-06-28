# ADR 0003 - Custom Solid Client Integration for Convex Auth

Date: 2026-06-28
Status: accepted

## Context

The Auth Foundation slice uses Convex Auth with Google. Convex Auth ships official client bindings only for React (`@convex-dev/auth/react`), but this app is built on SolidStart. The React `AuthProvider` owns several non-obvious responsibilities beyond rendering: persisting the JWT and refresh token, exchanging the OAuth `code` on redirect return, and — most importantly — exchanging the refresh token for a fresh JWT shortly before the current one expires.

The Convex browser client drives that last part: `setAuth(fetchToken)` runs `fetchToken({ forceRefreshToken: false })` once immediately and then schedules `fetchToken({ forceRefreshToken: true })` just before the JWT expires. A naive integration that ignores `forceRefreshToken` looks like it works but silently drops the session at the first token expiry.

## Decision

The app provides its own Solid integration in `src/lib/convex-auth-solid.tsx` (`ConvexAuthProvider` / `useConvexAuth`) rather than adopting the React bindings.

It mirrors the parts of the React provider the app actually needs:

- `fetchAccessToken` returns the current token normally and, when Convex requests a forced refresh, exchanges the stored refresh token via the unauthenticated `auth:signIn` action for a new token pair.
- Tokens are persisted to `localStorage` under the same keys the React provider uses.
- The OAuth `code` returned on redirect is exchanged on mount using a separate unauthenticated `ConvexHttpClient`, then stripped from the URL.
- `setAuth` is (re-)armed only after the token is known and after sign-in/sign-out, so the Convex client never caches a stale `null` on reload. The automatic expiry refresh path returns the token without re-arming, to avoid resetting the scheduler.

## Consequences

- Sessions survive JWT expiry because the refresh-token exchange is wired into `forceRefreshToken`.
- The integration tracks a few Convex Auth internals (the `auth:signIn` action contract, storage key names, the redirect `code` flow) that have no generated types, so call sites cast and a small result type is declared locally. Upgrades to `@convex-dev/auth` should re-check these against the React provider.
- This is dev-first. Production hardening (cross-tab token sync, refresh mutex, network-retry on the code exchange) that the React provider includes is intentionally deferred.
- This decision is scoped to client auth plumbing; backend identity still derives from Convex Auth on the server.
