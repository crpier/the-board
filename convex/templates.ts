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
import { DELETE_UNDO_WINDOW_MS } from "./memes";
import { r2, resolveUrl } from "./r2";
import { rateLimiter } from "./rateLimiter";

/**
 * Max stored length of a template's `name`. Templates are picked from a compact
 * grid, so the name is a short label, not free-form prose. Enforced (after
 * trim) in `createTemplate`.
 */
export const TEMPLATE_NAME_MAX_LENGTH = 80;

/**
 * A picker-ready template: `mediaKey` resolved to a CDN URL and `authorId`
 * collapsed into viewer-relative flags, so raw foreign keys never leave the
 * query (ADR 0006), exactly like `FeedMeme`. Templates carry no votes and no
 * visibility — they are always public — so this is a deliberately thinner shape
 * than the meme view-model.
 */
const templateViewValidator = v.object({
  _id: v.id("templates"),
  _creationTime: v.number(),
  name: v.string(),
  mediaUrl: v.string(),
  authorName: v.string(),
  // True when the requesting viewer created this template — gates the owner
  // delete control without leaking `authorId`.
  isOwner: v.boolean(),
  // True when the viewer is an admin — gates the admin remove control. A pure
  // UI hint; `removeTemplate` re-checks server-side.
  canModerate: v.boolean(),
});

export type TemplateView = Infer<typeof templateViewValidator>;

/**
 * The paginated envelope for template lists, mirroring `memes`'
 * `feedPageValidator`: `splitCursor`/`pageStatus` are only present when Convex
 * splits a page, hence optional.
 */
const templatePageValidator = v.object({
  page: v.array(templateViewValidator),
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

async function toTemplateView(
  ctx: QueryCtx,
  template: Doc<"templates">,
  viewer: Viewer,
): Promise<TemplateView> {
  const author = await ctx.db.get(template.authorId);
  return {
    _id: template._id,
    _creationTime: template._creationTime,
    name: template.name,
    mediaUrl: resolveUrl(template.mediaKey),
    authorName: author?.displayName ?? author?.name ?? "Anon",
    isOwner: viewer.viewerId !== null && template.authorId === viewer.viewerId,
    canModerate: viewer.isAdmin,
  };
}

/**
 * Lowercase, whitespace-collapsed search blob for a template name, mirroring
 * `memes.buildSearchText`. Empty input yields `""`, which never matches.
 */
function buildTemplateSearchText(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * The template library picker (#84): ready templates, newest first, paginated.
 * Open to any viewer — templates are always public — but only signed-in users
 * can reach `/create` to actually use one. Newest-first via the `by_status`
 * index's built-in `_creationTime` trailing key in descending order.
 */
export const listTemplates = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: templatePageValidator,
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const result = await ctx.db
      .query("templates")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(
        result.page.map((template) => toTemplateView(ctx, template, viewer)),
      ),
    };
  },
});

/**
 * Name search over the template library (#84). Same paginated envelope as
 * `listTemplates`. `status` is pinned to `ready` so deleted templates never
 * surface. An empty/whitespace query returns an empty page rather than running
 * an empty search (which Convex rejects), matching `memes.searchMemes`.
 */
export const searchTemplates = query({
  args: { query: v.string(), paginationOpts: paginationOptsValidator },
  returns: templatePageValidator,
  handler: async (ctx, args) => {
    const text = args.query.trim();
    if (text.length === 0) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const viewer = await getViewer(ctx);
    const result = await ctx.db
      .query("templates")
      .withSearchIndex("search_name", (q) =>
        q.search("searchText", text).eq("status", "ready"),
      )
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(
        result.page.map((template) => toTemplateView(ctx, template, viewer)),
      ),
    };
  },
});

/**
 * Load a single ready template by id, for the creator to hydrate a base image
 * picked from the library (`/create?template=<id>`). Returns `null` for a
 * malformed id, a missing template, or a deleted one — the same opaque
 * treatment as `getMeme`, so a stale id never confirms existence.
 */
export const getTemplate = query({
  args: { id: v.string() },
  returns: v.union(templateViewValidator, v.null()),
  handler: async (ctx, args) => {
    const templateId = ctx.db.normalizeId("templates", args.id);
    if (templateId === null) {
      return null;
    }
    const template = await ctx.db.get(templateId);
    if (template === null || template.status !== "ready") {
      return null;
    }
    const viewer = await getViewer(ctx);
    return await toTemplateView(ctx, template, viewer);
  },
});

/**
 * Save a base image to the template library (#84). The caller uploads the
 * original base file to R2 first (`generateUploadUrl` + `syncMetadata`) and
 * hands us the object `key`, exactly like `memes.createMeme` — templates reuse
 * the meme media pipeline wholesale.
 *
 * An **action**, not a mutation, for the identical reason `createMeme` is: a
 * validation rejection must *delete* the orphaned R2 object as a separately
 * committed step, which a rolled-back mutation can't do.
 *
 * Templates are static images only: `classifyMedia` must return `"image"`
 * (GIFs classify as `"gif"` and are rejected here, matching the creator's UI
 * rejection). Size is re-checked against the shared image ceiling. Rate limited
 * on the existing `uploadMeme` bucket — a template save *is* an upload — with
 * the same non-consuming peek/consume split `createMeme` uses.
 */
export const createTemplate = action({
  args: { key: v.string(), name: v.string() },
  returns: v.id("templates"),
  handler: async (ctx, args): Promise<Id<"templates">> => {
    const authorId = await getAuthUserId(ctx);
    if (authorId === null) {
      throw new Error("You must be signed in to save a template.");
    }

    const name = args.name.trim();
    if (name.length === 0) {
      throw new Error("A template needs a name.");
    }
    if (name.length > TEMPLATE_NAME_MAX_LENGTH) {
      throw new Error(
        `Template name is too long (max ${TEMPLATE_NAME_MAX_LENGTH} characters).`,
      );
    }

    // Non-consuming peek before any R2 work; the token is consumed atomically
    // with the insert in `insertTemplate` (see `memes.createMeme` for the full
    // argument on why an action must not consume it here).
    await rateLimiter.check(ctx, "uploadMeme", { key: authorId, throws: true });

    const metadata = await r2.getMetadata(ctx, args.key);
    if (metadata === null) {
      throw new Error(
        "Base image not found. Upload the image before saving a template.",
      );
    }

    const mediaType = metadata.contentType
      ? classifyMedia(metadata.contentType)
      : null;
    if (mediaType !== "image") {
      await r2.deleteObject(ctx, args.key);
      throw new Error("Templates must be a static image (no GIFs or video).");
    }
    if (metadata.size === undefined) {
      await r2.deleteObject(ctx, args.key);
      throw new Error(
        "Base image is missing size metadata and can't be validated.",
      );
    }
    if (metadata.size > MEDIA_LIMITS.image) {
      await r2.deleteObject(ctx, args.key);
      throw new Error(
        `That image exceeds the ${MEDIA_LIMITS.image / MEGABYTE} MB limit.`,
      );
    }

    return await ctx.runMutation(internal.templates.insertTemplate, {
      authorId,
      mediaKey: args.key,
      name,
    });
  },
});

/**
 * Insert a validated template as `ready` and consume the `uploadMeme` rate
 * token in the same transaction (same rationale as
 * `memes.insertProcessingMeme`: an action's `ctx.runMutation` commits
 * independently, so consuming the token here — not in the action — means it
 * only sticks when the template is actually persisted). Internal-only:
 * `authorId` is derived server-side by `createTemplate`.
 */
export const insertTemplate = internalMutation({
  args: {
    authorId: v.id("users"),
    mediaKey: v.string(),
    name: v.string(),
  },
  returns: v.id("templates"),
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, "uploadMeme", {
      key: args.authorId,
      throws: true,
    });

    return await ctx.db.insert("templates", {
      name: args.name,
      searchText: buildTemplateSearchText(args.name),
      mediaKey: args.mediaKey,
      mediaType: "image",
      status: "ready",
      authorId: args.authorId,
    });
  },
});

/**
 * Shared soft-delete core for a template (ADR 0009/0013), reused by owner
 * delete, admin removal, and report resolution — the same "pull shared write
 * logic into a plain helper rather than chaining `ctx.runMutation`" pattern
 * `memes.applyModerationVisibility` follows. Flips the template to `deleted`
 * and schedules the R2 reclaim `DELETE_UNDO_WINDOW_MS` out, whose job id's
 * presence *is* the undo window. No-ops (returns `false`) on a missing or
 * already-deleted template so a double action can't double-schedule.
 */
async function softDeleteTemplate(
  ctx: MutationCtx,
  templateId: Id<"templates">,
): Promise<boolean> {
  const template = await ctx.db.get(templateId);
  if (template === null || template.status === "deleted") {
    return false;
  }
  const reclaimJobId = await ctx.scheduler.runAfter(
    DELETE_UNDO_WINDOW_MS,
    internal.templates.reclaimDeletedTemplate,
    { templateId },
  );
  await ctx.db.patch(templateId, {
    status: "deleted",
    deletedAt: Date.now(),
    reclaimJobId,
  });
  return true;
}

/**
 * Exposed for report resolution (`reports.resolveReport`) so hiding a reported
 * template removes it via the same soft-delete core, without `reports.ts`
 * re-deriving the tombstone-and-schedule dance.
 */
export async function applyTemplateRemoval(
  ctx: MutationCtx,
  templateId: Id<"templates">,
): Promise<boolean> {
  return await softDeleteTemplate(ctx, templateId);
}

/**
 * Load a template and assert the caller owns it, throwing an opaque "not found"
 * for a missing, deleted, or someone-else's template — the same gate shape as
 * `memes.requireOwnedMeme`.
 */
async function requireOwnedTemplate(
  ctx: QueryCtx,
  templateId: Id<"templates">,
  viewerId: Id<"users"> | null,
): Promise<Doc<"templates">> {
  if (viewerId === null) {
    throw new Error("You must be signed in to manage a template.");
  }
  const template = await ctx.db.get(templateId);
  if (template === null || template.status === "deleted") {
    throw new Error("Template not found.");
  }
  if (template.authorId !== viewerId) {
    throw new Error("You can only manage your own templates.");
  }
  return template;
}

/**
 * Owner-only soft delete of a template (#84), with the standard undo window
 * (ADR 0013). A plain mutation — the R2 side effect lives entirely in the
 * scheduled reclaim job — mirroring `memes.deleteMeme`.
 */
export const deleteTemplate = mutation({
  args: { templateId: v.id("templates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewerId = await getAuthUserId(ctx);
    await requireOwnedTemplate(ctx, args.templateId, viewerId);
    await softDeleteTemplate(ctx, args.templateId);
    return null;
  },
});

/**
 * Admin-only removal of any template (#84, user story 19). Soft delete with the
 * same undo window as an owner delete, reachable regardless of ownership.
 * Opaque "not found" on every failure (guest, non-admin, missing, already
 * removed), matching `memes.moderateMeme`.
 */
export const removeTemplate = mutation({
  args: { templateId: v.id("templates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer.isAdmin) {
      throw new Error("Template not found.");
    }
    const applied = await softDeleteTemplate(ctx, args.templateId);
    if (!applied) {
      throw new Error("Template not found.");
    }
    return null;
  },
});

/**
 * Restore a soft-deleted template within its undo window. Allowed for the
 * template's owner *or* an admin, so both the owner's undo toast and an admin's
 * "undo removal" resolve through one path. Restorable exactly when the template
 * is `deleted` and still carries a `reclaimJobId` (ADR 0013).
 */
export const restoreTemplate = mutation({
  args: { templateId: v.id("templates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (viewer.viewerId === null) {
      throw new Error("You must be signed in to manage a template.");
    }
    const template = await ctx.db.get(args.templateId);
    if (
      template === null ||
      (template.authorId !== viewer.viewerId && !viewer.isAdmin)
    ) {
      throw new Error("Template not found.");
    }
    if (template.status !== "deleted" || template.reclaimJobId === undefined) {
      throw new Error("This template can no longer be restored.");
    }

    await ctx.scheduler.cancel(template.reclaimJobId);
    await ctx.db.patch(args.templateId, {
      status: "ready",
      deletedAt: undefined,
      reclaimJobId: undefined,
    });
    return null;
  },
});

/**
 * Fires `DELETE_UNDO_WINDOW_MS` after a template soft-delete. An action, so it
 * can touch R2 as a separately-committed step; the transactional guard +
 * `reclaimJobId` clear happen first in `finalizeTemplateReclaim`, so a raced
 * restore or a re-run is a clean no-op rather than a double delete. Mirrors
 * `memes.reclaimDeletedMeme`.
 */
export const reclaimDeletedTemplate = internalAction({
  args: { templateId: v.id("templates") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const mediaKey: string | null = await ctx.runMutation(
      internal.templates.finalizeTemplateReclaim,
      { templateId: args.templateId },
    );
    if (mediaKey !== null) {
      await r2.deleteObject(ctx, mediaKey);
    }
    return null;
  },
});

/**
 * Transactional half of `reclaimDeletedTemplate`: confirm the template is still
 * pending reclaim and clear `reclaimJobId` *before* the caller touches R2, so a
 * failed object delete leaves an orphan (reclaimable by the sweep) rather than
 * a re-triggerable state. Returns `null` for "nothing to reclaim".
 */
export const finalizeTemplateReclaim = internalMutation({
  args: { templateId: v.id("templates") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const template = await ctx.db.get(args.templateId);
    if (
      template === null ||
      template.status !== "deleted" ||
      template.reclaimJobId === undefined
    ) {
      return null;
    }
    await ctx.db.patch(args.templateId, { reclaimJobId: undefined });
    return template.mediaKey;
  },
});
