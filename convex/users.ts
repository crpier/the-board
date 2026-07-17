import { paginationOptsValidator } from "convex/server";
import { type Infer, v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./authz";

/**
 * A roster row for the admin user-management surface (#68): just enough to
 * identify a user and show/toggle their role. Display name resolution
 * mirrors every other read-time view-model (`displayName ?? name ?? "Anon"`,
 * ADR 0011) so raw auth-provider fields don't leak to the client unresolved.
 */
const userRosterRowValidator = v.object({
  _id: v.id("users"),
  displayName: v.string(),
  email: v.optional(v.string()),
  isAdmin: v.boolean(),
});

export type UserRosterRow = Infer<typeof userRosterRowValidator>;

const userRosterPageValidator = v.object({
  page: v.array(userRosterRowValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(
    v.union(
      v.literal("SplitRecommended"),
      v.literal("SplitRequired"),
      v.null(),
    ),
  ),
});

/**
 * Admin-only paginated roster backing `/admin/users` (#68). No index is
 * needed here — the query walks every user with no filter, just Convex's
 * default `_creationTime` order, which is exactly what `.paginate()` is for.
 */
export const listUsers = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: userRosterPageValidator,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db.query("users").paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((user) => ({
        _id: user._id,
        displayName: user.displayName ?? user.name ?? "Anon",
        email: user.email,
        isAdmin: user.isAdmin === true,
      })),
    };
  },
});

/**
 * Promote a user to admin (#68). Idempotent — promoting an already-admin user
 * is a no-op rather than an error, so a caller never has to check current
 * role before acting.
 */
export const promoteUser = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (target === null) {
      throw new Error("User not found.");
    }
    if (target.isAdmin === true) {
      return null;
    }
    await ctx.db.patch(args.userId, { isAdmin: true });
    return null;
  },
});

/**
 * Demote an admin back to a regular user (#68). Blocked server-side when the
 * target is the last remaining admin — the product must always have at least
 * one admin able to grant admin to anyone else, or the role becomes
 * unrecoverable without direct database access. `by_isAdmin` bounds the check
 * to at most two reads regardless of table size (Convex guideline: no
 * `.collect().length` counting): if fewer than two admins exist, the target
 * (already confirmed admin above) must be the only one.
 */
export const demoteUser = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (target === null) {
      throw new Error("User not found.");
    }
    if (target.isAdmin !== true) {
      return null;
    }

    const admins = await ctx.db
      .query("users")
      .withIndex("by_isAdmin", (q) => q.eq("isAdmin", true))
      .take(2);
    if (admins.length <= 1) {
      throw new Error("Cannot demote the last remaining admin.");
    }

    await ctx.db.patch(args.userId, { isAdmin: false });
    return null;
  },
});
