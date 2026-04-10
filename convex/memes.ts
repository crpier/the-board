import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

export const listPublicMemes = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("memes")
      .withIndex("by_visibility_and_status", (q) =>
        q.eq("visibility", "public").eq("status", "ready"),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});
