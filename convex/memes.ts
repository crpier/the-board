import { paginationOptsValidator } from "convex/server";
import { type Infer, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { resolveUrl } from "./r2";

/**
 * A feed-ready meme: every foreign key resolved so the client renders straight
 * from this object. `authorId → users.name` becomes a live display name and the
 * `mediaKey` becomes an R2/CDN URL here, so raw FKs never leave the query
 * (see ADR 0006). This validator is the single source of truth for the shape:
 * the `FeedMeme` type is inferred from it and it is the query's `returns`
 * validator, so a future field can't silently leak a raw FK to the client.
 */
const feedMemeValidator = v.object({
  _id: v.id("memes"),
  _creationTime: v.number(),
  title: v.optional(v.string()),
  mediaUrl: v.string(),
  mediaType: v.union(v.literal("image"), v.literal("gif"), v.literal("video")),
  tags: v.array(v.string()),
  authorName: v.string(),
  upvoteCount: v.number(),
  downvoteCount: v.number(),
});

export type FeedMeme = Infer<typeof feedMemeValidator>;

/**
 * Resolve a stored meme into its feed view-model. The author's display name is
 * read live from `users.name` (falling back to "Anon", as elsewhere) rather than
 * denormalized, so a profile rename is reflected everywhere immediately.
 */
async function toFeedMeme(
  ctx: QueryCtx,
  meme: Doc<"memes">,
): Promise<FeedMeme> {
  const author = await ctx.db.get(meme.authorId);
  return {
    _id: meme._id,
    _creationTime: meme._creationTime,
    title: meme.title,
    mediaUrl: resolveUrl(meme.mediaKey),
    mediaType: meme.mediaType,
    tags: meme.tags,
    authorName: author?.name ?? "Anon",
    upvoteCount: meme.upvoteCount,
    downvoteCount: meme.downvoteCount,
  };
}

export const listPublicMemes = query({
  args: { paginationOpts: paginationOptsValidator },
  // Pins the page shape to the view-model so raw FKs can't reach the client.
  // The envelope mirrors Convex's `.paginate()` result; `splitCursor` and
  // `pageStatus` are only present when Convex splits a page, hence optional.
  returns: v.object({
    page: v.array(feedMemeValidator),
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
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("memes")
      .withIndex("by_visibility_and_status", (q) =>
        q.eq("visibility", "public").eq("status", "ready"),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((meme) => toFeedMeme(ctx, meme))),
    };
  },
});
