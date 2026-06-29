import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { type Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type QueryCtx,
  action,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { MEDIA_LIMITS, MEGABYTE, classifyMedia } from "./media";
import { r2, resolveUrl } from "./r2";
import { mediaTypeValidator, visibilityValidator } from "./validators";

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
  mediaType: mediaTypeValidator,
  tags: v.array(v.string()),
  // Editable metadata the owner's edit form prefills from. Always "public" in
  // the public feed (which filters on it), but carried so the same view-model
  // serves owner-facing surfaces without a second read.
  visibility: visibilityValidator,
  authorName: v.string(),
  // True when the requesting viewer authored this meme. Computed server-side
  // from `authorId === getAuthUserId` so the raw `authorId` never leaves the
  // query (ADR 0006) while the client can still gate owner-only controls.
  isOwner: v.boolean(),
  upvoteCount: v.number(),
  downvoteCount: v.number(),
});

export type FeedMeme = Infer<typeof feedMemeValidator>;

/**
 * Resolve a stored meme into its feed view-model. The author's display name is
 * read live from `users.name` (falling back to "Anon", as elsewhere) rather than
 * denormalized, so a profile rename is reflected everywhere immediately.
 *
 * `viewerId` is the authenticated viewer (or `null` for guests), resolved once
 * by the caller so ownership can be flagged without re-deriving the identity per
 * meme.
 */
async function toFeedMeme(
  ctx: QueryCtx,
  meme: Doc<"memes">,
  viewerId: Id<"users"> | null,
): Promise<FeedMeme> {
  const author = await ctx.db.get(meme.authorId);
  return {
    _id: meme._id,
    _creationTime: meme._creationTime,
    title: meme.title,
    mediaUrl: resolveUrl(meme.mediaKey),
    mediaType: meme.mediaType,
    tags: meme.tags,
    visibility: meme.visibility,
    authorName: author?.name ?? "Anon",
    isOwner: viewerId !== null && meme.authorId === viewerId,
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
    const viewerId = await getAuthUserId(ctx);
    const result = await ctx.db
      .query("memes")
      .withIndex("by_visibility_and_status", (q) =>
        q.eq("visibility", "public").eq("status", "ready"),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(
        result.page.map((meme) => toFeedMeme(ctx, meme, viewerId)),
      ),
    };
  },
});

/**
 * Read-time query backing the meme detail page at `/meme/:id` (#42). Returns the
 * same `FeedMeme` view-model as the feed (via `toFeedMeme`) so the detail page
 * reuses `MemeCard` wholesale, or `null` when the meme is not visible to the
 * caller.
 *
 * The id arrives as `v.string()` (a raw URL param), not `v.id`, so a malformed
 * param is normalized to `null` here rather than throwing an argument-validation
 * error: `normalizeId` returns `null` for anything that isn't a valid id for this
 * table.
 *
 * Authorization matrix (no admin special-casing — that's deferred to
 * Moderation):
 *   - Only `ready` memes are ever visible; `deleted` and every non-`ready`
 *     status resolve to `null` for everyone.
 *   - A `public` ready meme is visible to everyone (guest, non-owner, owner).
 *   - A `private` ready meme is visible only to its owner — this slice's new
 *     capability, since private memes appear nowhere in the feed.
 *
 * Every hidden case returns the *same* opaque `null` (bad id, deleted, hidden,
 * not-yours-private) so the query never reveals whether an id exists, mirroring
 * `requireOwnedMeme`.
 */
export const getMeme = query({
  args: { id: v.string() },
  returns: v.union(feedMemeValidator, v.null()),
  handler: async (ctx, args) => {
    const memeId = ctx.db.normalizeId("memes", args.id);
    if (memeId === null) {
      return null;
    }

    const meme = await ctx.db.get(memeId);
    // Tombstoned and not-yet-`ready` memes are gone/unviewable for everyone.
    if (meme === null || meme.status !== "ready") {
      return null;
    }

    const viewerId = await getAuthUserId(ctx);
    const isOwner = viewerId !== null && meme.authorId === viewerId;
    // A private meme is owner-only; public ready memes are open to all.
    if (meme.visibility !== "public" && !isOwner) {
      return null;
    }

    return await toFeedMeme(ctx, meme, viewerId);
  },
});

/**
 * Canonicalize user-supplied tags (`docs/glossary.md#tags`): trim, lowercase,
 * collapse internal whitespace, drop empties, and de-duplicate while preserving
 * first-seen order so the same idea always maps to one reusable tag.
 */
function canonicalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const canonical: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (tag.length > 0 && !seen.has(tag)) {
      seen.add(tag);
      canonical.push(tag);
    }
  }
  return canonical;
}

/**
 * Publish a meme from an already-uploaded R2 object (single-step publish, see
 * epic #26). The caller uploads bytes directly to R2 first (`generateUploadUrl`
 * + `syncMetadata`) and then hands us the object `key`.
 *
 * This is an **action**, not a mutation, on purpose: validation can reject the
 * upload, and a rejection must *delete* the orphaned R2 object. A mutation that
 * deleted then threw would roll the delete back with the transaction, stranding
 * the object; an action runs the cleanup as its own committed step before
 * throwing, so a rejected upload leaves neither a meme nor an orphaned object.
 *
 * Validation is server-authoritative: `mediaType` is derived from the object's
 * real content-type (never trusted from the client) and the size is re-checked
 * against the per-type ceiling. On success the meme is inserted as `processing`
 * and the lifecycle stub flips it to `ready`.
 */
export const createMeme = action({
  args: {
    key: v.string(),
    title: v.optional(v.string()),
    tags: v.array(v.string()),
    visibility: v.optional(visibilityValidator),
  },
  returns: v.id("memes"),
  handler: async (ctx, args): Promise<Id<"memes">> => {
    const authorId = await getAuthUserId(ctx);
    if (authorId === null) {
      throw new Error("You must be signed in to publish a meme.");
    }

    // `syncMetadata` (run by the upload flow) persists the object's real
    // content-type and size; read them back as the source of truth.
    const metadata = await r2.getMetadata(ctx, args.key);
    if (metadata === null) {
      // No synced object for this key: there is nothing to bind and nothing to
      // clean up, so reject without scheduling a delete.
      throw new Error(
        "Uploaded media not found. Upload the file before publishing.",
      );
    }

    // Any validation failure deletes the orphaned object so a rejected upload
    // leaves no bytes behind.
    const mediaType = metadata.contentType
      ? classifyMedia(metadata.contentType)
      : null;
    if (mediaType === null) {
      await r2.deleteObject(ctx, args.key);
      throw new Error(
        "Unsupported media type. Upload an image, GIF, or video.",
      );
    }
    if (metadata.size === undefined) {
      // Validation is server-authoritative; an object whose size we can't read
      // can't be confirmed within a ceiling, so reject it rather than guess.
      await r2.deleteObject(ctx, args.key);
      throw new Error(
        "Uploaded media is missing size metadata and can't be validated.",
      );
    }
    if (metadata.size > MEDIA_LIMITS[mediaType]) {
      await r2.deleteObject(ctx, args.key);
      throw new Error(
        `That ${mediaType} exceeds the ${
          MEDIA_LIMITS[mediaType] / MEGABYTE
        } MB limit.`,
      );
    }

    return await ctx.runMutation(internal.memes.insertProcessingMeme, {
      authorId,
      mediaKey: args.key,
      mediaType,
      title: args.title,
      tags: canonicalizeTags(args.tags),
      // Default to public; the upload UI offers a public/private toggle.
      visibility: args.visibility ?? "public",
    });
  },
});

/**
 * Insert a validated meme as `processing` and schedule the lifecycle flip in the
 * same transaction, so a meme is never persisted without its finalize step
 * queued. Internal-only: `authorId` is derived server-side by `createMeme` and
 * handed in, never accepted from a client.
 */
export const insertProcessingMeme = internalMutation({
  args: {
    authorId: v.id("users"),
    mediaKey: v.string(),
    mediaType: mediaTypeValidator,
    title: v.optional(v.string()),
    tags: v.array(v.string()),
    visibility: visibilityValidator,
  },
  returns: v.id("memes"),
  handler: async (ctx, args) => {
    const memeId = await ctx.db.insert("memes", {
      title: args.title,
      visibility: args.visibility,
      status: "processing",
      mediaKey: args.mediaKey,
      mediaType: args.mediaType,
      tags: args.tags,
      authorId: args.authorId,
      upvoteCount: 0,
      downvoteCount: 0,
    });
    await ctx.scheduler.runAfter(0, internal.memes.finalizeProcessing, {
      memeId,
    });
    return memeId;
  },
});

/**
 * Lifecycle stub for the `processing → ready` flip. Single-step publish has no
 * real optimization yet, so this immediately marks the meme `ready`. The async
 * lifecycle is fully wired here (insert → schedule → flip) so #25 only has to
 * make this body do real work and emit `ready` *or* `failed`.
 *
 * Idempotent and self-guarding: it no-ops unless the meme is still `processing`,
 * so a retried or stale invocation can't resurrect a deleted meme or clobber a
 * later status.
 */
export const finalizeProcessing = internalMutation({
  args: { memeId: v.id("memes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const meme = await ctx.db.get(args.memeId);
    if (meme === null || meme.status !== "processing") {
      return null;
    }
    await ctx.db.patch(args.memeId, { status: "ready" });
    return null;
  },
});

/**
 * Load a meme and assert the caller owns it, throwing the same opaque "not
 * found" for a missing, already-deleted, or someone-else's meme so the edit and
 * delete paths share one authorization gate and don't reveal a meme's existence
 * to a non-owner. Authorization keys off `authorId === getAuthUserId` (#31).
 */
async function requireOwnedMeme(
  ctx: QueryCtx,
  memeId: Id<"memes">,
  viewerId: Id<"users"> | null,
): Promise<Doc<"memes">> {
  if (viewerId === null) {
    throw new Error("You must be signed in to manage a meme.");
  }
  const meme = await ctx.db.get(memeId);
  // A tombstoned meme is treated as gone: no further edits or re-deletes.
  if (meme === null || meme.status === "deleted") {
    throw new Error("Meme not found.");
  }
  if (meme.authorId !== viewerId) {
    throw new Error("You can only manage your own memes.");
  }
  return meme;
}

/**
 * Owner-only edit of a meme's metadata: `title`, `tags`, and `visibility`. The
 * media item itself is immutable here — there is no swap (#31). Tags run through
 * the same `canonicalizeTags` path as `createMeme`, so edited and freshly
 * published tags normalize identically.
 *
 * `title` is trimmed server-side: an omitted or blank value clears the title
 * (patching it to `undefined` removes the field) rather than storing an empty
 * string, matching what the publish form sends.
 */
export const updateMeme = mutation({
  args: {
    memeId: v.id("memes"),
    title: v.optional(v.string()),
    tags: v.array(v.string()),
    visibility: visibilityValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    await requireOwnedMeme(ctx, args.memeId, viewerId);

    const title = args.title?.trim();
    await ctx.db.patch(args.memeId, {
      title: title ? title : undefined,
      tags: canonicalizeTags(args.tags),
      visibility: args.visibility,
    });
    return null;
  },
});

/**
 * Owner-only delete of a meme. This is an **action** for the same reason
 * `createMeme` is: it commits a database change and then reclaims the R2 object,
 * and an action runs the object delete as its own committed step.
 *
 * Delete is a soft tombstone: the meme is flipped to `status = "deleted"` (which
 * hides it everywhere, already guarded by the public read filters) and its R2
 * bytes are reclaimed. Vote rows are left in place. Ordering matters — the
 * tombstone commits first, so a failed object delete leaves an orphaned object
 * (reclaimable later) rather than a still-visible meme. There is no restore UI;
 * a delayed-reclaim undo window is future work.
 */
export const deleteMeme = action({
  args: { memeId: v.id("memes") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    // The tombstone (with its auth + ownership check) commits before we touch
    // R2, so the meme is hidden even if the object delete later fails.
    const mediaKey: string = await ctx.runMutation(
      internal.memes.tombstoneMeme,
      { memeId: args.memeId },
    );
    await r2.deleteObject(ctx, mediaKey);
    return null;
  },
});

/**
 * Tombstone a meme and return its R2 key for reclamation. Internal-only. The
 * viewer is derived server-side from the auth context (which propagates through
 * `ctx.runMutation` from `deleteMeme`), never accepted as an argument. The
 * ownership gate lives here, inside the transaction, so the status flip and the
 * authorization check can't race.
 */
export const tombstoneMeme = internalMutation({
  args: { memeId: v.id("memes") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    const meme = await requireOwnedMeme(ctx, args.memeId, viewerId);
    await ctx.db.patch(args.memeId, { status: "deleted" });
    return meme.mediaKey;
  },
});
