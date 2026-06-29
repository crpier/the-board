import { paginationOptsValidator } from "convex/server";

import type { Doc } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { resolveUrl } from "./r2";

/**
 * A feed-ready meme: every foreign key resolved so the client renders straight
 * from this object. `authorId → users.name` becomes a live display name and the
 * `mediaKey` becomes an R2/CDN URL here, so raw FKs never leave the query
 * (extends ADR 0001).
 */
export type FeedMeme = {
  _id: Doc<"memes">["_id"];
  _creationTime: number;
  title?: string;
  mediaUrl: string;
  mediaType: Doc<"memes">["mediaType"];
  tags: string[];
  authorName: string;
  upvoteCount: number;
  downvoteCount: number;
};

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
