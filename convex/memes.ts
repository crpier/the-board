import { query } from "./_generated/server";

export const listPublicMemes = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("memes")
      .withIndex("by_visibility_and_status", (q) =>
        q.eq("visibility", "public").eq("status", "ready"),
      )
      .order("desc")
      .take(20);
  },
});
