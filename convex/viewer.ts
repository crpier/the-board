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
      avatarUrl:
        user.image ?? "https://avatars.githubusercontent.com/u/322913?v=4",
      isAdmin: user.isAdmin ?? false,
    };
  },
});
