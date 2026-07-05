import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
// Shared with the settings form via the backend-free `convex/profile.ts`
// (ADR 0008) — the client must not import this server module for the cap.
import { MAX_DISPLAY_NAME_LENGTH } from "./profile";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);

    if (userId === null) {
      return null;
    }

    const user = await ctx.db.get(userId);

    if (user === null) {
      return null;
    }
    return {
      id: user._id,
      // User-set override first; `name` is OAuth-managed and rewritten on
      // every sign-in (ADR 0011).
      displayName: user.displayName ?? user.name ?? "Anon",
      // Null when Google gave us no picture; the UI falls back to an initial.
      avatarUrl: user.image ?? null,
      isAdmin: user.isAdmin ?? false,
    };
  },
});

/**
 * Set (or clear) the viewer's display-name override. Identity is derived
 * server-side — no user id argument (ADR 0009). A blank/whitespace value
 * clears the override (patching to `undefined` removes the field), reverting
 * attribution to the provider-managed `name` — the same blank-clears
 * convention as meme titles.
 */
export const updateDisplayName = mutation({
  args: { displayName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You must be signed in to edit your profile.");
    }

    const trimmed = args.displayName.trim();
    if (trimmed.length === 0) {
      await ctx.db.patch(userId, { displayName: undefined });
      return null;
    }
    if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
      throw new Error(
        `Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
      );
    }
    await ctx.db.patch(userId, { displayName: trimmed });
    return null;
  },
});
