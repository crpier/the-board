/**
 * Shared profile-field rules for the settings UI and the server mutation.
 *
 * `updateDisplayName` enforces the cap authoritatively; the settings form sets
 * the input's `maxlength` from the same constant so the two can't drift. This
 * module is intentionally backend-free (no `_generated/server` or auth
 * imports) so it is safe to bundle into the browser (ADR 0008) — importing
 * `convex/viewer.ts` directly from `src/` would pull the whole server module
 * into the client chunk.
 */

/** Cap for the user-set display name (ADR 0011). */
export const MAX_DISPLAY_NAME_LENGTH = 40;
