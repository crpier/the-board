import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { getViewer } from "./authz";
import { applyModerationVisibility } from "./memes";
import { resolveUrl } from "./r2";
import { mediaTypeValidator, reportReasonValidator } from "./validators";

/**
 * One row of the admin review queue: a report plus just enough resolved
 * context (reporter name, meme thumbnail) to act on it without a second
 * round trip. Mirrors `FeedMeme`'s read-time FK resolution (ADR 0006) — raw
 * `reporterId`/`memeId` foreign keys never leave this query except as the ids
 * the resolve mutation needs back.
 *
 * `memeAvailable` is false for a meme that's gone (bad id, already deleted)
 * by the time an admin reviews the report; the queue still shows the report
 * (dismiss is always possible) but hides the meme preview and disables hide.
 */
const reportQueueItemValidator = v.object({
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
 * Admin-only: the open-reports queue backing `/admin` (#67). Opaque denial —
 * a guest or signed-in non-admin gets the same "Not found." as every other
 * admin-gated surface (`memes.moderateMeme`, ADR 0012) rather than a
 * distinguishable "forbidden", so the queue never confirms admin status to a
 * prober.
 *
 * Oldest-open-report-first via `by_status`, so the longest-waiting reports
 * surface first — the same `_creationTime` ascending default every other
 * list in this app uses.
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
        const [reporter, meme] = await Promise.all([
          ctx.db.get(report.reporterId),
          ctx.db.get(report.memeId),
        ]);
        const memeAvailable = meme !== null && meme.status !== "deleted";
        return {
          _id: report._id,
          _creationTime: report._creationTime,
          reason: report.reason,
          details: report.details,
          reporterName: reporter?.displayName ?? reporter?.name ?? "Anon",
          memeId: report.memeId,
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
 * open report on it. Backs the report button's disabled/"Reported" state,
 * the same read-your-own-state shape as `votes.cardState`. Returns `"none"`
 * for guests rather than throwing — like `cardState`, this is a public,
 * degrade-gracefully read, not an admin-gated one.
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
 * File a report on a meme (#67). Signed-in only. One open report per
 * reporter per meme — a second attempt while the first is still open throws
 * rather than silently duplicating, using the `by_meme_and_reporter_and_status`
 * index (no filter scan, per Convex guidelines) so the check is a single
 * indexed lookup.
 *
 * Reportable only if the meme is public + ready, mirroring `castVote`'s guard
 * (and the opaque-not-found convention elsewhere): a missing id, a private
 * meme, and a meme an admin already hid all throw the identical "Meme not
 * found." error, so a guessed/stale id can't be used as an existence oracle.
 * No owner exception — reporting your own private meme is pointless. One
 * consequence: once an admin hides a meme it can no longer be reported, which
 * is fine because it's already hidden.
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
 * Admin-only: resolve an open report by hiding the reported meme (via the
 * same `applyModerationVisibility` core `moderateMeme` uses) or dismissing it
 * with no meme change. Both branches record `resolvedBy` so the resolution is
 * attributable.
 *
 * Idempotent no-op on an already-resolved/dismissed report or a missing one,
 * rather than throwing — two admins racing to act on the same report (or a
 * doubled click) should not surface an error, and the opaque-not-found
 * convention elsewhere is about hiding *existence*, which doesn't apply once
 * the caller is already a confirmed admin looking at a real report id.
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
      await applyModerationVisibility(ctx, report.memeId, "private");
    }

    await ctx.db.patch(args.reportId, {
      status: args.resolution === "hide" ? "resolved" : "dismissed",
      resolvedBy: viewer.viewerId,
    });
    return null;
  },
});
