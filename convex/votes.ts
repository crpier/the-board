import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { rateLimiter } from "./rateLimiter";

/**
 * A cast vote's direction. Shared so `cardState.myVote` and `castVote.value`
 * cannot drift; `myVote` widens it with `v.null()` for the no-vote case.
 */
const voteValue = v.union(v.literal("up"), v.literal("down"));

/**
 * Per-card reactive vote state: aggregate counts plus the viewer's own vote.
 *
 * Every card subscribes to this query so counts and the viewer's vote stay live
 * regardless of which feed page loaded the card (page 2+ arrives via non-reactive
 * one-shot queries), and it is the single query the vote optimistic update
 * patches (see ADR 0004).
 *
 * Public query: it must work for guests, so it returns `myVote: null` rather than
 * throwing when unauthenticated.
 *
 * For a missing / non-public / non-ready meme it returns `null` rather than
 * throwing. This matches `castVote`'s guard intent — vote state only exists for
 * memes a viewer could legitimately see — but a reactive read should degrade
 * gracefully instead of tearing down the card's live subscription when a meme is
 * later hidden or deleted.
 */
export const cardState = query({
  args: { memeId: v.id("memes") },
  returns: v.union(
    v.null(),
    v.object({
      upvoteCount: v.number(),
      downvoteCount: v.number(),
      myVote: v.union(voteValue, v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const meme = await ctx.db.get(args.memeId);
    if (
      meme === null ||
      meme.visibility !== "public" ||
      meme.status !== "ready"
    ) {
      return null;
    }

    const userId = await getAuthUserId(ctx);
    const myVoteRow =
      userId === null
        ? null
        : await ctx.db
            .query("votes")
            .withIndex("by_user_and_meme", (q) =>
              q.eq("userId", userId).eq("memeId", args.memeId),
            )
            .unique();

    return {
      upvoteCount: meme.upvoteCount,
      downvoteCount: meme.downvoteCount,
      myVote: myVoteRow?.value ?? null,
    };
  },
});

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
 * only path that mutates vote counts, so the counters cannot drift and a
 * decrement always corresponds to an existing row — the counts therefore can
 * never go negative by construction (see ADR 0004). No defensive clamp is
 * applied, because clamping each counter independently would let a flip from an
 * already-drifted count diverge from the true row total.
 */
export const castVote = mutation({
  args: {
    memeId: v.id("memes"),
    value: voteValue,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You must be signed in to vote.");
    }

    // Per-user limit (#69, docs/adr/0013-rate-limiting.md). Checked before the
    // meme lookup so a rate-limited caller is rejected without spending extra
    // reads. `throws: true` makes this reject with a `ConvexError` carrying
    // `{ kind: "RateLimited", name, retryAfter }`, which the client detects
    // with `isRateLimitError` (see `src/lib/errors.ts`).
    await rateLimiter.limit(ctx, "castVote", { key: userId, throws: true });

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
      upvoteCount: meme.upvoteCount + upDelta,
      downvoteCount: meme.downvoteCount + downDelta,
    });
  },
});
