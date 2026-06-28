import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation } from "./_generated/server";

/**
 * Cast, change, or clear the current user's vote on a meme.
 *
 * Toggle semantics relative to the committed vote:
 * - no existing vote  -> insert the new vote
 * - same value again  -> delete the vote (un-vote)
 * - opposite value    -> flip the vote
 *
 * The meme's denormalized `upvoteCount` / `downvoteCount` are adjusted in the
 * same transaction so they always equal the number of vote rows. This is the
 * only path that mutates vote counts. Counters are clamped at zero so a drifted
 * count can never go negative.
 */
export const castVote = mutation({
  args: {
    memeId: v.id("memes"),
    value: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You must be signed in to vote.");
    }

    const meme = await ctx.db.get(args.memeId);
    if (
      meme === null ||
      meme.visibility !== "public" ||
      meme.status !== "ready"
    ) {
      throw new Error("Meme not found.");
    }

    const existing = await ctx.db
      .query("votes")
      .withIndex("by_user_and_meme", (q) =>
        q.eq("userId", userId).eq("memeId", args.memeId),
      )
      .unique();

    let upDelta = 0;
    let downDelta = 0;

    if (existing === null) {
      await ctx.db.insert("votes", {
        userId,
        memeId: args.memeId,
        value: args.value,
      });
      if (args.value === "up") {
        upDelta = 1;
      } else {
        downDelta = 1;
      }
    } else if (existing.value === args.value) {
      await ctx.db.delete(existing._id);
      if (args.value === "up") {
        upDelta = -1;
      } else {
        downDelta = -1;
      }
    } else {
      await ctx.db.patch(existing._id, { value: args.value });
      if (args.value === "up") {
        upDelta = 1;
        downDelta = -1;
      } else {
        upDelta = -1;
        downDelta = 1;
      }
    }

    await ctx.db.patch(args.memeId, {
      upvoteCount: Math.max(0, meme.upvoteCount + upDelta),
      downvoteCount: Math.max(0, meme.downvoteCount + downDelta),
    });
  },
});
