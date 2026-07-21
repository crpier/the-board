import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getViewer } from "./authz";
import { applyModerationVisibility } from "./memes";
import { resolveUrl } from "./r2";
import { applyTemplateRemoval } from "./templates";
import { mediaTypeValidator, reportReasonValidator } from "./validators";

/**
 * One row of the admin review queue, resolved with just enough context to act
 * on it without a second round trip. Mirrors `FeedMeme`'s read-time FK
 * resolution (ADR 0006) — raw foreign keys never leave this query except as the
 * ids the resolve mutation needs back.
 *
 * A report targets a meme *or* a template (#84, ADR 0020), so the item is a
 * discriminated union on `targetType`. `memeAvailable`/`templateAvailable` are
 * false when the target is gone (bad id, already deleted) by review time; the
 * report still shows (dismiss is always possible) but the preview and hide
 * control are disabled.
 */
const memeReportItemValidator = v.object({
  targetType: v.literal("meme"),
  _id: v.id("reports"),
  _creationTime: v.number(),
  reason: reportReasonValidator,
  details: v.optional(v.string()),
  reporterName: v.string(),
  memeId: v.id("memes"),
  memeAvailable: v.boolean(),
  memeTitle: v.optional(v.string()),
  memeMediaUrl: v.optional(v.string()),
  memeMediaType: v.optional(mediaTypeValidator),
});

const templateReportItemValidator = v.object({
  targetType: v.literal("template"),
  _id: v.id("reports"),
  _creationTime: v.number(),
  reason: reportReasonValidator,
  details: v.optional(v.string()),
  reporterName: v.string(),
  templateId: v.id("templates"),
  templateAvailable: v.boolean(),
  templateName: v.optional(v.string()),
  templateMediaUrl: v.optional(v.string()),
});

const reportQueueItemValidator = v.union(
  memeReportItemValidator,
  templateReportItemValidator,
);

// Mirrors `memes.ts`'s `feedPageValidator`: `splitCursor`/`pageStatus` are
// only present when Convex splits a page, hence optional.
const reportQueuePageValidator = v.object({
  page: v.array(reportQueueItemValidator),
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
 * Admin-only: the open-reports queue backing `/admin` (#67, extended for
 * templates in #84). Opaque denial — a guest or signed-in non-admin gets the
 * same "Not found." as every other admin-gated surface.
 *
 * Oldest-open-report-first via `by_status`. Each row resolves its reporter and
 * its target (meme or template) into the discriminated view-model above.
 */
export const listOpenReports = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: reportQueuePageValidator,
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer.isAdmin) {
      throw new Error("Not found.");
    }

    const result = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("asc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      result.page.map(async (report) => {
        const reporter = await ctx.db.get(report.reporterId);
        const reporterName = reporter?.displayName ?? reporter?.name ?? "Anon";
        const common = {
          _id: report._id,
          _creationTime: report._creationTime,
          reason: report.reason,
          details: report.details,
          reporterName,
        };

        // Template report: discriminated by a present `templateId`.
        if (report.templateId !== undefined) {
          const template = await ctx.db.get(report.templateId);
          const templateAvailable =
            template !== null && template.status !== "deleted";
          return {
            ...common,
            targetType: "template" as const,
            templateId: report.templateId,
            templateAvailable,
            templateName: templateAvailable ? template.name : undefined,
            templateMediaUrl: templateAvailable
              ? resolveUrl(template.mediaKey)
              : undefined,
          };
        }

        // Otherwise a meme report. `memeId` is guaranteed present for a
        // non-template report by `createReport`.
        const memeId = report.memeId!;
        const meme = await ctx.db.get(memeId);
        const memeAvailable = meme !== null && meme.status !== "deleted";
        return {
          ...common,
          targetType: "meme" as const,
          memeId,
          memeAvailable,
          memeTitle: memeAvailable ? meme.title : undefined,
          memeMediaUrl: memeAvailable ? resolveUrl(meme.mediaKey) : undefined,
          memeMediaType: memeAvailable ? meme.mediaType : undefined,
        };
      }),
    );

    return { ...result, page };
  },
});

/**
 * The viewer's own report state on one meme: whether they already have an
 * open report on it. Backs the report button's disabled/"Reported" state.
 * Returns `"none"` for guests rather than throwing — a public, degrade-
 * gracefully read.
 */
export const myReportStatus = query({
  args: { memeId: v.id("memes") },
  returns: v.union(v.literal("none"), v.literal("open")),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return "none";
    }
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_meme_and_reporter_and_status", (q) =>
        q
          .eq("memeId", args.memeId)
          .eq("reporterId", userId)
          .eq("status", "open"),
      )
      .unique();
    return existing === null ? "none" : "open";
  },
});

/**
 * The viewer's own open-report state on one template (#84), the template twin
 * of `myReportStatus`.
 */
export const myTemplateReportStatus = query({
  args: { templateId: v.id("templates") },
  returns: v.union(v.literal("none"), v.literal("open")),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return "none";
    }
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_template_and_reporter_and_status", (q) =>
        q
          .eq("templateId", args.templateId)
          .eq("reporterId", userId)
          .eq("status", "open"),
      )
      .unique();
    return existing === null ? "none" : "open";
  },
});

/**
 * File a report on a meme (#67). Signed-in only. One open report per reporter
 * per meme, enforced via the `by_meme_and_reporter_and_status` index. Reportable
 * only if the meme is public + ready; a missing id, a private meme, and a
 * hidden meme all throw the identical opaque "Meme not found." so a guessed id
 * can't be an existence oracle.
 */
export const createReport = mutation({
  args: {
    memeId: v.id("memes"),
    reason: reportReasonValidator,
    details: v.optional(v.string()),
  },
  returns: v.id("reports"),
  handler: async (ctx, args) => {
    const reporterId = await getAuthUserId(ctx);
    if (reporterId === null) {
      throw new Error("You must be signed in to report a meme.");
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
      .query("reports")
      .withIndex("by_meme_and_reporter_and_status", (q) =>
        q
          .eq("memeId", args.memeId)
          .eq("reporterId", reporterId)
          .eq("status", "open"),
      )
      .unique();
    if (existing !== null) {
      throw new Error("You already reported this meme. It's pending review.");
    }

    const details = args.details?.trim();
    return await ctx.db.insert("reports", {
      reporterId,
      memeId: args.memeId,
      reason: args.reason,
      details: details && details.length > 0 ? details : undefined,
      status: "open",
      resolvedBy: undefined,
    });
  },
});

/**
 * File a report on a template (#84), the template twin of `createReport`.
 * Reportable only if the template is `ready` (templates are always public);
 * a missing id and a removed template both throw the same opaque "Template not
 * found.". One open report per reporter per template.
 */
export const createTemplateReport = mutation({
  args: {
    templateId: v.id("templates"),
    reason: reportReasonValidator,
    details: v.optional(v.string()),
  },
  returns: v.id("reports"),
  handler: async (ctx, args) => {
    const reporterId = await getAuthUserId(ctx);
    if (reporterId === null) {
      throw new Error("You must be signed in to report a template.");
    }

    const template = await ctx.db.get(args.templateId);
    if (template === null || template.status !== "ready") {
      throw new Error("Template not found.");
    }

    const existing = await ctx.db
      .query("reports")
      .withIndex("by_template_and_reporter_and_status", (q) =>
        q
          .eq("templateId", args.templateId)
          .eq("reporterId", reporterId)
          .eq("status", "open"),
      )
      .unique();
    if (existing !== null) {
      throw new Error(
        "You already reported this template. It's pending review.",
      );
    }

    const details = args.details?.trim();
    return await ctx.db.insert("reports", {
      reporterId,
      templateId: args.templateId,
      reason: args.reason,
      details: details && details.length > 0 ? details : undefined,
      status: "open",
      resolvedBy: undefined,
    });
  },
});

/**
 * Admin-only: resolve an open report. "hide" acts on the report's target — a
 * meme is hidden via `applyModerationVisibility` (set private), a template is
 * removed via `applyTemplateRemoval` (soft delete + reclaim) — while "dismiss"
 * changes nothing. Both record `resolvedBy`. Idempotent no-op on an
 * already-resolved or missing report.
 */
export const resolveReport = mutation({
  args: {
    reportId: v.id("reports"),
    resolution: v.union(v.literal("hide"), v.literal("dismiss")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer.isAdmin || viewer.viewerId === null) {
      throw new Error("Not found.");
    }

    const report = await ctx.db.get(args.reportId);
    if (report === null || report.status !== "open") {
      return null;
    }

    if (args.resolution === "hide") {
      if (report.templateId !== undefined) {
        await applyTemplateRemoval(ctx, report.templateId);
      } else if (report.memeId !== undefined) {
        await applyModerationVisibility(ctx, report.memeId, "private");
      }
    }

    await ctx.db.patch(args.reportId, {
      status: args.resolution === "hide" ? "resolved" : "dismissed",
      resolvedBy: viewer.viewerId,
    });
    return null;
  },
});
