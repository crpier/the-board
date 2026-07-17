import { getAuthUserId } from "@convex-dev/auth/server";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * The per-request viewer context: their user id (or `null` for guests) plus
 * whether their user doc carries `isAdmin === true`. Shared by every surface
 * that needs to know "who is this and are they an admin" — the feed queries'
 * `canModerate`/`isOwner` flags, `moderateMeme` (#56), and admin user
 * management (#68).
 */
export type Viewer = { viewerId: Id<"users"> | null; isAdmin: boolean };

/**
 * Resolve the requesting viewer once per query/mutation: their user id (or
 * `null` for guests) plus their admin flag (same read as `viewer.current`).
 */
export async function getViewer(ctx: QueryCtx | MutationCtx): Promise<Viewer> {
  const viewerId = await getAuthUserId(ctx);
  if (viewerId === null) {
    return { viewerId: null, isAdmin: false };
  }
  const user = await ctx.db.get(viewerId);
  return { viewerId, isAdmin: user?.isAdmin === true };
}

/**
 * Require the requesting viewer to be a signed-in admin, returning their user
 * id. Used by admin-only mutations/queries that have no reason to hide their
 * own existence from a non-admin caller (unlike `moderateMeme`'s opaque
 * not-found, which hides whether a *meme* exists) — the admin user-management
 * surface (#68) just needs a plain, honest "you can't do this."
 */
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const viewer = await getViewer(ctx);
  if (viewer.viewerId === null || !viewer.isAdmin) {
    throw new Error("Admin access required.");
  }
  return viewer.viewerId;
}
