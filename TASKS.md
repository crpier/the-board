# Auth Foundation Tasks

Status: draft
Last updated: 2026-04-10

## Parent PRD

`PRD.md`

## Task 1 - Wire Convex Auth into the app

Status: todo

### What to build

Establish the real dev auth path for the app using Convex Auth with Google. This task should prove the app can complete a real sign-in and sign-out flow in development and should include the SolidStart-specific client integration needed to use Convex Auth from the existing app.

### Acceptance criteria

- [ ] Convex Auth is configured in the app backend for development.
- [ ] Google sign-in is configured for local development.
- [ ] The app can complete a real sign-in flow in development.
- [ ] The app can complete a real sign-out flow in development.
- [ ] The SolidStart app has the client-side integration required to work with Convex Auth.

### Blocked by

None - can start immediately.

### User stories addressed

- User story 3
- User story 4
- User story 15
- User story 16
- User story 20

## Task 2 - Provision and expose the current user

Status: todo

### What to build

Build the app-facing authenticated viewer boundary using the Convex Auth `users` table. This task should provision the user during the auth flow, assign the first registered user as admin, and expose a current-user query the app can use as its primary viewer interface.

### Acceptance criteria

- [ ] The app uses the Convex Auth `users` table instead of a parallel users table.
- [ ] A newly authenticated user is provisioned during the auth flow.
- [ ] App-owned fields needed by the product are stored on the auth user document.
- [ ] The first registered user is assigned admin status automatically.
- [ ] A current-user query returns the app-facing viewer state or `null` when signed out.

### Blocked by

- Blocked by Task 1

### User stories addressed

- User story 7
- User story 8
- User story 9
- User story 10
- User story 11
- User story 12

## Task 3 - Add minimal global navbar auth UI

Status: todo

### What to build

Add a minimal global navbar that exposes auth state without changing the app's guest browsing behavior. This task should surface auth loading, signed-out, and signed-in states in the app shell with the simplest viable UI.

### Acceptance criteria

- [ ] A minimal navbar appears globally at the top of the app.
- [ ] Signed-out state shows a sign-in action.
- [ ] Signed-in state shows avatar, display name, and sign-out action.
- [ ] Auth loading state is handled visibly in the navbar.
- [ ] Guest browsing continues to work as before.

### Blocked by

- Blocked by Task 2

### User stories addressed

- User story 1
- User story 2
- User story 4
- User story 5
- User story 6
- User story 17
- User story 18
- User story 19

## Task 4 - Validate the auth foundation end to end

Status: todo

### What to build

Validate the auth slice through manual end-to-end checks focused on the externally visible behavior and the app-facing viewer boundary. This task should prove the Google login flow, sign-out behavior, current-user behavior, and first-user-admin rule in development.

### Acceptance criteria

- [ ] Manual validation confirms Google sign-in works in development.
- [ ] Manual validation confirms sign-out works in development.
- [ ] Manual validation confirms the navbar reflects loading, signed-out, and signed-in states correctly.
- [ ] Manual validation confirms the current-user boundary behaves correctly for signed-in and signed-out viewers.
- [ ] Manual validation confirms the first registered user becomes admin.

### Blocked by

- Blocked by Task 3

### User stories addressed

- User story 1
- User story 3
- User story 4
- User story 5
- User story 11
- User story 15
- User story 16
- User story 19
- User story 20

## Task 5 - Run slice closeout architecture review

Status: todo

### What to build

Run `/improve-codebase-architecture` on the completed slice before considering it closed. Capture accepted refactors in this task list or `docs/ADRs.md`, and keep the slice open until that review is complete or explicitly deferred.

### Acceptance criteria

- [ ] `/improve-codebase-architecture` has been run on the completed slice.
- [ ] Accepted refactors are either completed in this slice or captured as explicit follow-up work.
- [ ] Any accepted cross-cutting decision is recorded in `docs/ADRs.md`.
- [ ] The slice is not marked closed until this review is complete or explicitly deferred.

### Blocked by

- Blocked by Task 4

### User stories addressed

- User story 20

## Slice notes

- This slice establishes the auth foundation and app-facing current-user boundary for later features.
- Manual validation is the default verification approach for this slice because local Google OAuth requires real provider configuration and human interaction.
- `PRD.md` and `TASKS.md` are temporary planning files for the active slice and should not remain in a mergeable pull request.
