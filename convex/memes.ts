import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { type Infer, v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  type QueryCtx,
  action,
  internalAction,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { type Viewer, getViewer } from "./authz";
import { MEDIA_LIMITS, MEGABYTE, classifyMedia } from "./media";
import { r2, resolveUrl } from "./r2";
import { rateLimiter } from "./rateLimiter";
import { mediaTypeValidator, visibilityValidator } from "./validators";

/**
 * A feed-ready meme: every foreign key resolved so the client renders straight
 * from this object. `authorId` becomes a live display name (the user-set
 * `displayName` override, else the OAuth-managed `name`) and the
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
  authorProfileHref: v.string(),
  // True when the requesting viewer authored this meme. Computed server-side
  // from `authorId === getAuthUserId` so the raw `authorId` never leaves the
  // query (ADR 0006) while the client can still gate owner-only controls.
  isOwner: v.boolean(),
  // True when the viewer is an admin (#56). Purely a UI gate for the moderation
  // control on cards — it never widens which memes a query returns, and the
  // server re-checks admin status inside `moderateMeme`.
  canModerate: v.boolean(),
  upvoteCount: v.number(),
  downvoteCount: v.number(),
});

export type FeedMeme = Infer<typeof feedMemeValidator>;

/**
 * The paginated read envelope shared by every feed-shaped query
 * (`listPublicMemes`, `searchMemes`). It mirrors Convex's `.paginate()` result;
 * `splitCursor` and `pageStatus` are only present when Convex splits a page,
 * hence optional. Declared once so the page shape can't drift between queries.
 */
const feedPageValidator = v.object({
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
});

/**
 * Resolve a stored meme into its feed view-model. The author's display name is
 * read live from the user row (`displayName ?? name ?? "Anon"`, as elsewhere)
 * rather than denormalized, so a profile rename is reflected everywhere
 * immediately.
 *
 * `viewer` is the authenticated viewer's id and admin flag (or `null` viewerId
 * for guests), resolved once by the caller (`getViewer`) so neither the identity
 * nor the admin lookup is re-derived per meme.
 */
async function toFeedMeme(
  ctx: QueryCtx,
  meme: Doc<"memes">,
  viewer: Viewer,
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
    authorName: author?.displayName ?? author?.name ?? "Anon",
    authorProfileHref: `/profile/${meme.authorId}`,
    isOwner: viewer.viewerId !== null && meme.authorId === viewer.viewerId,
    canModerate: viewer.isAdmin,
    upvoteCount: meme.upvoteCount,
    downvoteCount: meme.downvoteCount,
  };
}

export const listPublicMemes = query({
  args: { paginationOpts: paginationOptsValidator },
  // Pins the page shape to the view-model so raw FKs can't reach the client.
  returns: feedPageValidator,
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
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
        result.page.map((meme) => toFeedMeme(ctx, meme, viewer)),
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
 * Authorization matrix (no admin special-casing — admins get no special detail
 * access; `moderateMeme` only reaches memes an admin can already see):
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

    const viewer = await getViewer(ctx);
    const isOwner =
      viewer.viewerId !== null && meme.authorId === viewer.viewerId;
    // A private meme is owner-only; public ready memes are open to all. Admins
    // get no special detail access (product overview) — `viewer.isAdmin` only
    // feeds the `canModerate` flag on memes the viewer could already see.
    if (meme.visibility !== "public" && !isOwner) {
      return null;
    }

    return await toFeedMeme(ctx, meme, viewer);
  },
});

/**
 * Random-discovery backing the nav "Random" action (#66, ADR 0014). Returns a
 * random public, ready meme's id, or `null` if there are none.
 *
 * Strategy — random-key index seek, not a table scan: `seed` is a `[0, 1)`
 * float the **client** generates fresh per click with `Math.random()`. This
 * query is otherwise pure — a query re-run with the same `seed` against
 * unchanged data returns the same meme, satisfying Convex's determinism
 * expectation for queries, while the client supplying a new `seed` each click
 * is what makes repeated clicks land on different memes.
 *
 * The lookup is a single indexed `.first()` (`by_visibility_and_status_and_randomKey`):
 * seek the first public+ready meme whose stored `randomKey >= seed`. If none
 * exists (seed landed past the highest key), wrap around to the first
 * public+ready meme in key order. This is O(log n) via the index, not O(n) —
 * cost doesn't grow with table size.
 *
 * Rows written before `randomKey` shipped are still `undefined` until
 * `backfillRandomKey` runs; Convex sorts a missing field first, so those rows
 * are only reachable through the wraparound branch until backfilled — a
 * temporary skew, not a broken/missing meme.
 */
export const getRandomMeme = query({
  args: { seed: v.number() },
  returns: v.union(v.id("memes"), v.null()),
  handler: async (ctx, args) => {
    const seeked = await ctx.db
      .query("memes")
      .withIndex("by_visibility_and_status_and_randomKey", (q) =>
        q
          .eq("visibility", "public")
          .eq("status", "ready")
          .gte("randomKey", args.seed),
      )
      .order("asc")
      .first();
    if (seeked !== null) {
      return seeked._id;
    }

    // No key at or past the seed: wrap around to the smallest key in the
    // public+ready partition. `null` here means the partition is empty.
    const wrapped = await ctx.db
      .query("memes")
      .withIndex("by_visibility_and_status_and_randomKey", (q) =>
        q.eq("visibility", "public").eq("status", "ready"),
      )
      .order("asc")
      .first();
    return wrapped?._id ?? null;
  },
});

/**
 * Reactive full-text search backing `/search` (epic #49, ADR 0010). Returns the
 * same paginated envelope and `FeedMeme` view-model as `listPublicMemes`, so
 * result cards get live votes, the owner flag, and owner controls for free.
 *
 * Single-mode relevance search: the one `search_searchText` index ranks public,
 * ready memes by how well their title + tags match `query`. Visibility/status
 * are pinned to `public`/`ready` for **every** viewer — a static,
 * viewer-independent filter, so an owner's own private memes never surface and
 * there is no per-viewer branch that could leak a private meme's existence.
 * `mediaType` is an optional refinement, applied only when provided.
 *
 * Empty or whitespace-only `query` returns an empty page rather than throwing or
 * running an empty search (a Convex search needs a non-empty term). All
 * narrowing is index-driven — no `.filter()` (Convex guideline).
 */
export const getProfile = query({
  args: { profileId: v.string() },
  returns: v.union(
    v.object({
      displayName: v.string(),
      profileHref: v.string(),
      isViewer: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const profileId = ctx.db.normalizeId("users", args.profileId);
    if (profileId === null) return null;
    const user = await ctx.db.get(profileId);
    if (user === null) return null;
    const viewer = await getViewer(ctx);
    return {
      displayName: user.displayName ?? user.name ?? "Anon",
      profileHref: `/profile/${profileId}`,
      isViewer: viewer.viewerId !== null && viewer.viewerId === profileId,
    };
  },
});

export const listProfileMemes = query({
  args: { profileId: v.string(), paginationOpts: paginationOptsValidator },
  returns: feedPageValidator,
  handler: async (ctx, args) => {
    const authorId = ctx.db.normalizeId("users", args.profileId);
    if (authorId === null || (await ctx.db.get(authorId)) === null) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const viewer = await getViewer(ctx);
    const isOwner = viewer.viewerId !== null && viewer.viewerId === authorId;
    const result = isOwner
      ? await ctx.db
          .query("memes")
          .withIndex("by_author_and_status", (q) =>
            q.eq("authorId", authorId).eq("status", "ready"),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("memes")
          .withIndex("by_author_and_visibility_and_status", (q) =>
            q
              .eq("authorId", authorId)
              .eq("visibility", "public")
              .eq("status", "ready"),
          )
          .order("desc")
          .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(
        result.page.map((meme) => toFeedMeme(ctx, meme, viewer)),
      ),
    };
  },
});

export const searchMemes = query({
  args: {
    query: v.string(),
    mediaType: v.optional(mediaTypeValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: feedPageValidator,
  handler: async (ctx, args) => {
    const text = args.query.trim();
    if (text.length === 0) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const viewer = await getViewer(ctx);
    const result = await ctx.db
      .query("memes")
      .withSearchIndex("search_searchText", (q) => {
        const ranked = q
          .search("searchText", text)
          .eq("visibility", "public")
          .eq("status", "ready");
        return args.mediaType === undefined
          ? ranked
          : ranked.eq("mediaType", args.mediaType);
      })
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(
        result.page.map((meme) => toFeedMeme(ctx, meme, viewer)),
      ),
    };
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
 * Build the denormalized `searchText` for a meme: its title plus its
 * (already-canonicalized) tags, joined by spaces. The author is deliberately
 * excluded — `authorName` is resolved live from `users.name` (ADR 0006), and
 * folding it in would reintroduce the rename staleness ADR 0006 exists to avoid.
 *
 * Shared the same way `canonicalizeTags` is: computed on every write that
 * touches title/tags (the create-lifecycle insert and the owner edit) so search
 * always reflects current metadata. Empty input yields `""`, which never matches
 * a search — correct degradation for a titleless, tagless meme.
 */
function buildSearchText(title: string | undefined, tags: string[]): string {
  return [title ?? "", ...tags].join(" ").trim();
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

    // Per-user limit (#69, docs/adr/0017-rate-limiting.md). This is a
    // non-consuming *peek* — `check`, not `limit` — so a caller who is already
    // over budget gets rejected before any R2 work, without spending a token
    // on the peek itself. The token that actually counts against the bucket is
    // consumed atomically with the DB insert in `insertProcessingMeme`, not
    // here: this is an action, and nested `ctx.runMutation` calls from an
    // action commit independently of the action's own outcome, so consuming
    // the token here would permanently charge the user even when a later
    // validation step (e.g. a missing R2 object) rejects the upload. See
    // docs/adr/0017-rate-limiting.md for the full argument.
    await rateLimiter.check(ctx, "uploadMeme", { key: authorId, throws: true });

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
 *
 * This is also where the `uploadMeme` token (#69, docs/adr/0017-rate-limiting.md)
 * is *consumed* — not in `createMeme`. `createMeme` is an action, and a
 * `ctx.runMutation` call from an action commits independently of the action:
 * it does not roll back when the action later throws. Consuming the token in
 * the action would therefore permanently charge a caller for an upload that
 * still gets rejected by a later check (e.g. an unsynced R2 object), locking
 * out legitimate users who simply retried a failed upload. Doing it here
 * makes token consumption part of the same mutation transaction as the
 * insert, so it only sticks when the meme is actually persisted.
 *
 * `skipRateLimit` exists solely for `seed.ts`, which calls this mutation
 * directly (bypassing `createMeme` and its auth) to publish a batch of dev
 * fixtures in one script run; that batch is typically larger than the
 * 10/hour budget and seeding isn't a real user action, so it must not be
 * throttled. No other caller should pass it.
 */
export const insertProcessingMeme = internalMutation({
  args: {
    authorId: v.id("users"),
    mediaKey: v.string(),
    mediaType: mediaTypeValidator,
    title: v.optional(v.string()),
    tags: v.array(v.string()),
    visibility: visibilityValidator,
    skipRateLimit: v.optional(v.boolean()),
  },
  returns: v.id("memes"),
  handler: async (ctx, args) => {
    if (args.skipRateLimit !== true) {
      await rateLimiter.limit(ctx, "uploadMeme", {
        key: args.authorId,
        throws: true,
      });
    }

    const memeId = await ctx.db.insert("memes", {
      title: args.title,
      // `args.tags` are already canonicalized by the caller (`createMeme`/seed).
      searchText: buildSearchText(args.title, args.tags),
      // Assigned once, never rewritten (ADR 0014) — the random-key index seek
      // behind `getRandomMeme` depends on this being a stable, uniform tag.
      randomKey: Math.random(),
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
    const meme = await requireOwnedMeme(ctx, args.memeId, viewerId);

    // Per-user limit (#69, docs/adr/0017-rate-limiting.md). Checked after
    // ownership is confirmed, using `meme.authorId` (guaranteed equal to
    // `viewerId` by `requireOwnedMeme`) so the key is typed as `Id<"users">`
    // without a redundant null check on `viewerId`.
    await rateLimiter.limit(ctx, "updateMeme", {
      key: meme.authorId,
      throws: true,
    });

    const title = args.title?.trim() || undefined;
    const tags = canonicalizeTags(args.tags);
    await ctx.db.patch(args.memeId, {
      title,
      tags,
      visibility: args.visibility,
      // Recompute so the edited title/tags are immediately searchable.
      searchText: buildSearchText(title, tags),
    });
    return null;
  },
});

/**
 * The shared core of every admin visibility change: patch `visibility` on a
 * meme that's still live, no-op on a missing/tombstoned one. Callers own the
 * admin gate — this only applies the write.
 *
 * Pulled out so `moderateMeme` (#56, ADR 0012) and the admin report queue's
 * "hide" resolution (`reports.resolveReport`, #67) share one apply step
 * instead of the queue re-deriving the same patch, per the guideline to pull
 * shared write logic into a plain helper rather than chaining
 * `ctx.runMutation` calls across a transaction.
 */
export async function applyModerationVisibility(
  ctx: MutationCtx,
  memeId: Id<"memes">,
  visibility: Doc<"memes">["visibility"],
): Promise<boolean> {
  const meme = await ctx.db.get(memeId);
  // A tombstoned meme is gone for moderation purposes, same as everywhere.
  if (meme === null || meme.status === "deleted") {
    return false;
  }
  await ctx.db.patch(memeId, { visibility });
  return true;
}

/**
 * Admin-only moderation (#56, ADR 0012): change any meme's visibility,
 * regardless of ownership. This is the whole moderation surface reachable
 * from a meme card — the admin report queue (#67) is a second entry point
 * onto the same `applyModerationVisibility` core.
 *
 * Denial shape: every failure — guest, non-admin, missing meme, tombstoned
 * meme — throws the same opaque "Meme not found." used by `requireOwnedMeme`,
 * so the mutation never confirms to a non-admin that a meme id exists. Admins
 * may moderate their own memes too; there is no owner exclusion here.
 */
export const moderateMeme = mutation({
  args: { memeId: v.id("memes"), visibility: visibilityValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer.isAdmin) {
      throw new Error("Meme not found.");
    }
    const applied = await applyModerationVisibility(
      ctx,
      args.memeId,
      args.visibility,
    );
    if (!applied) {
      throw new Error("Meme not found.");
    }
    return null;
  },
});

/**
 * Undo window between a soft-delete and its R2 reclaim (#71, ADR 0009). Owner
 * memory of "I can still get this back" and the reclaim job's fire delay are
 * the same number by construction — `deleteMeme` schedules the reclaim exactly
 * this far out.
 */
const DELETE_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Owner-only delete of a meme (#71, ADR 0009). Delete is a soft tombstone: the
 * meme flips to `status = "deleted"` (hidden everywhere by the existing public
 * read filters) and a `reclaimDeletedMeme` job is scheduled `DELETE_UNDO_WINDOW_MS`
 * out to actually remove the R2 object. Vote rows are left in place, same as
 * before.
 *
 * This is a plain **mutation**, not an action — unlike the original tombstone
 * (which touched R2 synchronously and so had to be an action), this only
 * writes the row and schedules a job, both of which are ordinary transactional
 * work. The R2 side effect moved entirely into the scheduled job.
 *
 * The scheduled job's id is stored as `reclaimJobId`; its *presence* is what
 * makes a meme restorable (`restoreMeme` requires and cancels it). A caller
 * that restores within the window gets their meme back with the R2 object
 * never touched.
 */
export const deleteMeme = mutation({
  args: { memeId: v.id("memes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    await requireOwnedMeme(ctx, args.memeId, viewerId);

    const reclaimJobId = await ctx.scheduler.runAfter(
      DELETE_UNDO_WINDOW_MS,
      internal.memes.reclaimDeletedMeme,
      { memeId: args.memeId },
    );
    await ctx.db.patch(args.memeId, {
      status: "deleted",
      deletedAt: Date.now(),
      reclaimJobId,
    });
    return null;
  },
});

/**
 * Owner-only restore of a soft-deleted meme, within its undo window (#71). A
 * meme is restorable exactly when it's `deleted` *and* still carries a
 * `reclaimJobId` — once the reclaim job has run (or the meme was never
 * deleted), there's nothing left to restore.
 *
 * Deliberately doesn't reuse `requireOwnedMeme`: that helper treats a `deleted`
 * meme as gone (correct for edit/re-delete), but restore's whole job is to act
 * on a deleted meme. Ownership and "not found" still collapse to the same
 * opaque error, matching the rest of the module.
 */
export const restoreMeme = mutation({
  args: { memeId: v.id("memes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    if (viewerId === null) {
      throw new Error("You must be signed in to manage a meme.");
    }
    const meme = await ctx.db.get(args.memeId);
    if (meme === null || meme.authorId !== viewerId) {
      throw new Error("Meme not found.");
    }
    if (meme.status !== "deleted" || meme.reclaimJobId === undefined) {
      throw new Error("This meme can no longer be restored.");
    }

    await ctx.scheduler.cancel(meme.reclaimJobId);
    await ctx.db.patch(args.memeId, {
      status: "ready",
      deletedAt: undefined,
      reclaimJobId: undefined,
    });
    return null;
  },
});

/**
 * Scheduled by `deleteMeme`, fires `DELETE_UNDO_WINDOW_MS` after a delete. An
 * **action** for the same reason the old `deleteMeme` was: it must touch R2 as
 * a separately-committed step. `finalizeReclaim` does the transactional part
 * first (guard + clear `reclaimJobId`) and hands back the key to delete, so a
 * restore that raced this job (or a re-run of an already-processed job) is a
 * clean no-op rather than a double-delete.
 */
export const reclaimDeletedMeme = internalAction({
  args: { memeId: v.id("memes") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const mediaKey: string | null = await ctx.runMutation(
      internal.memes.finalizeReclaim,
      { memeId: args.memeId },
    );
    if (mediaKey !== null) {
      await r2.deleteObject(ctx, mediaKey);
    }
    return null;
  },
});

/**
 * Transactional half of `reclaimDeletedMeme`: confirm the meme is still
 * pending reclaim (not restored, not already reclaimed by a prior run) and, if
 * so, clear `reclaimJobId` *before* the caller touches R2 — matching the
 * original tombstone's ordering, so a failed object delete leaves an orphaned
 * object (reclaimable later) rather than a meme stuck in a re-triggerable
 * state. Returns `null` to signal "nothing to reclaim", which the caller must
 * treat as a no-op rather than an error.
 */
export const finalizeReclaim = internalMutation({
  args: { memeId: v.id("memes") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const meme = await ctx.db.get(args.memeId);
    if (
      meme === null ||
      meme.status !== "deleted" ||
      meme.reclaimJobId === undefined
    ) {
      return null;
    }
    await ctx.db.patch(args.memeId, { reclaimJobId: undefined });
    return meme.mediaKey;
  },
});

/**
 * One-time, idempotent backfill for `searchText` (epic #49). Memes written
 * before the field shipped have no `searchText` and are therefore invisible to
 * `searchMemes`; this populates it from each row's current title + tags so the
 * back catalog becomes searchable.
 *
 * Bounded by pagination — the `memes` table grows unbounded and a large import
 * is planned, so it never `collect()`s the table. The caller drives it one page
 * at a time, feeding `continueCursor` back until `isDone`, e.g.:
 *
 *     pnpm convex run memes:backfillSearchText '{"paginationOpts":{"numItems":100,"cursor":null}}'
 *
 * Idempotent: it only writes rows where `searchText` is still missing, so rows
 * already populated (by this backfill or by a normal write) are skipped on a
 * re-run. `patched` reports how many rows this page actually touched.
 */
export const backfillSearchText = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.string(),
    scanned: v.number(),
    patched: v.number(),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("memes").paginate(args.paginationOpts);

    let patched = 0;
    for (const meme of result.page) {
      if (meme.searchText === undefined) {
        await ctx.db.patch(meme._id, {
          searchText: buildSearchText(meme.title, meme.tags),
        });
        patched++;
      }
    }

    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      scanned: result.page.length,
      patched,
    };
  },
});

/**
 * One-time, idempotent backfill for `randomKey` (#66, ADR 0014). Memes written
 * before the field shipped have no `randomKey` and are only reachable through
 * `getRandomMeme`'s wraparound branch until this runs; this assigns each such
 * row a fresh `Math.random()` value so the back catalog is uniformly seekable.
 *
 * Bounded by pagination, same shape and same manual, post-deploy invocation as
 * `backfillSearchText`:
 *
 *     pnpm convex run memes:backfillRandomKey '{"paginationOpts":{"numItems":100,"cursor":null}}'
 *
 * Idempotent: only rows still missing `randomKey` are patched, so a re-run
 * (or a race with normal writes, which always set `randomKey` on insert) skips
 * already-populated rows. `patched` reports how many rows this page touched.
 */
export const backfillRandomKey = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    isDone: v.boolean(),
    continueCursor: v.string(),
    scanned: v.number(),
    patched: v.number(),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("memes").paginate(args.paginationOpts);

    let patched = 0;
    for (const meme of result.page) {
      if (meme.randomKey === undefined) {
        await ctx.db.patch(meme._id, { randomKey: Math.random() });
        patched++;
      }
    }

    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      scanned: result.page.length,
      patched,
    };
  },
});
