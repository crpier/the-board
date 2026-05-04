# Auth Foundation PRD

Status: draft
Last updated: 2026-04-10

## Problem Statement

The app needs a real authentication foundation so it can distinguish guests from signed-in users and unlock later slices like voting, ownership, and moderation without inventing identity rules ad hoc in each feature.

Right now the app is browse-only. It has no login flow, no visible signed-in state, no app-level current-user boundary, and no admin bootstrapping rule. Without a dedicated auth foundation slice, every later authenticated feature would need to solve auth, user provisioning, and viewer state at the same time.

## Solution

Build a dev-first authentication foundation using Convex Auth with Google.

This slice should add a minimal global navbar with sign-in and sign-out controls, establish a current-user app boundary, provision and expose user state through the Convex Auth `users` table, and assign admin status to the first registered user. The slice should keep guest browsing behavior intact and avoid pulling later voting, ownership, or moderation features into the auth setup.

Because the app uses SolidStart rather than React, this slice also includes the custom Solid/Convex Auth client integration needed to make Convex Auth usable from the existing app.

## User Stories

1. As a guest, I want to keep browsing the public app without signing in, so that auth does not block the existing browse-first experience.
2. As a guest, I want to see a clear sign-in entry point, so that I understand the app supports authenticated participation.
3. As a user, I want to sign in with Google, so that I can use a familiar authentication flow during development.
4. As a user, I want to sign out from the app shell, so that I can end my authenticated session explicitly.
5. As a user, I want to see my signed-in state in the global navbar, so that the app clearly reflects who I am signed in as.
6. As a user, I want my avatar and display name to appear in the signed-in UI when available, so that the authenticated state feels real rather than abstract.
7. As the app, I want a single current-user boundary, so that later slices can depend on one app-facing viewer interface instead of raw provider state.
8. As the backend, I want to derive identity from Convex Auth instead of trusting client-provided user identifiers, so that authenticated behavior stays secure and idiomatic.
9. As the product team, I want the auth slice to use the Convex Auth `users` table instead of a parallel app-owned users table, so that the implementation stays aligned with the documented Convex Auth model.
10. As the product team, I want user provisioning to happen as part of the auth flow, so that later slices can assume a current app user exists once authentication succeeds.
11. As the product team, I want the first registered user to become admin automatically, so that future moderation and admin slices have a bootstrap path.
12. As a future feature, I want the auth slice to expose whether the current viewer is signed in and whether they are an admin, so that later features can branch on those states without rebuilding auth plumbing.
13. As a future voting slice, I want authenticated user state to already exist, so that voting can focus on vote semantics instead of login setup.
14. As a future ownership slice, I want a stable authenticated user record to already exist, so that uploads and ownership checks can attach to user identity cleanly.
15. As a developer, I want the auth slice to be dev-first, so that I can validate the flow with a real Google login before worrying about production rollout.
16. As a developer, I want local testing instructions that explain the real Google OAuth setup needed in development, so that auth debugging is predictable.
17. As a developer, I want a minimal navbar rather than a full polished shell, so that the slice stays focused on authentication instead of layout design.
18. As a developer, I want auth loading to be visible in the navbar, so that the app does not flicker incorrectly between signed-out and signed-in UI.
19. As a reviewer, I want the auth slice to leave guest browsing behavior unchanged, so that the new auth foundation does not regress the working public feed.
20. As a reviewer, I want the slice to prove SolidStart can interoperate with Convex Auth, so that future authenticated slices can build on a stable foundation.

## Implementation Decisions

- The slice uses Convex Auth with Google as the only auth provider.
- The slice is dev-first. Production auth rollout is explicitly deferred.
- The app continues to allow guest browsing without authentication.
- The slice introduces a minimal global navbar that always stays at the top of the page.
- The navbar should remain simple: home/app identity on the left, auth state and auth actions on the right.
- Signed-out navbar state shows a sign-in action.
- Signed-in navbar state shows avatar, display name, and sign-out action.
- Email is not displayed in this slice.
- Missing profile fields should fall back gracefully, including a simple display-name fallback and a visual avatar placeholder.
- The app should use a current-user query as its primary authenticated viewer boundary.
- App code should prefer the app-level current-user boundary over directly branching on raw provider state.
- Backend auth checks must derive identity from Convex Auth on the server.
- The slice should use the Convex Auth `users` table rather than introducing a parallel app users table.
- The Convex Auth user document should carry the app-owned fields needed now, including display name, avatar URL, and admin status.
- User provisioning should happen during the auth flow using Convex Auth’s user creation/update hooks rather than a later ad hoc client sync pattern.
- The first registered user becomes admin automatically.
- Admin assignment should be durable and not rebalanced later during normal sign-ins.
- User profile fields stored in the auth user document should be initialized from Google identity data and not refreshed on every login.
- The app uses SolidStart, so this slice includes the custom Solid client integration needed to work with Convex Auth even though the official client bindings are React-oriented.
- The slice should avoid introducing protected routes, voting, ownership checks, profile editing, or admin management UI.
- The slice should not invent broad authorization checks beyond what is required to establish identity, viewer state, and provisioning.

## Testing Decisions

- Tests should focus on externally visible auth behavior and stable boundaries rather than internal provider plumbing.
- Good tests for this slice should verify guest browsing remains intact, navbar auth state changes correctly, the current-user boundary behaves correctly, and first-user admin assignment works.
- The most important boundaries to test are the current-user query, provisioning behavior, and the visible navbar states.
- Testing should distinguish between auth-loading, signed-out, and signed-in UI states.
- Manual dev validation is acceptable for the real Google sign-in flow in this slice, because OAuth setup requires real provider configuration and human interaction.
- If automated tests are added, they should focus on backend/user-state behavior and app-visible viewer state rather than trying to fully automate Google OAuth.
- Prior art in the repo is limited, so this slice should prefer boundary tests and explicit validation notes over shallow implementation-coupled tests.

## Out of Scope

- No production-ready auth rollout.
- No additional auth providers beyond Google.
- No voting behavior.
- No protected detail route.
- No protected upload flow.
- No profile editing UI.
- No admin management UI beyond automatic first-user bootstrapping.
- No route guarding for authenticated-only pages.
- No custom auth error UX beyond provider-default behavior.
- No full visual shell redesign beyond a minimal navbar.

## Further Notes

- This slice exists to make later authenticated features smaller and more focused.
- The biggest technical risk in this slice is the SolidStart client integration with Convex Auth, not the backend auth model itself.
- Development setup will require a real Google OAuth client and a real developer login for local validation.
- The resulting `PRD.md` is temporary planning state for the active slice and should not remain in a mergeable PR.
