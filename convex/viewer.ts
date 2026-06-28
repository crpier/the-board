import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

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
      displayName: user.name ?? "Anon",
      // Null when Google gave us no picture; the UI falls back to an initial.
      avatarUrl: user.image ?? null,
      isAdmin: user.isAdmin ?? false,
    };
  },
});
