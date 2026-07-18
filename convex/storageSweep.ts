import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { DELETE_UNDO_WINDOW_MS } from "./memes";
import { r2 } from "./r2";

/**
 * Cleanup for the failure mode #81 exists to cover: `reclaimDeletedMeme`
 * (ADR 0013) does its transactional half (`finalizeReclaim`, which clears
 * `reclaimJobId`) as a separately-committed step *before* calling
 * `r2.deleteObject`. If that delete throws, the meme is correctly gone
 * forever but its R2 object is orphaned — nothing ever retries the delete.
 * This periodic sweep (registered in `convex/crons.ts`) finds and removes
 * exactly those objects, plus any object that was never claimed by a meme row
 * at all (e.g. an upload the caller abandoned before calling `createMeme`).
 *
 * A page of `r2.listMetadata` is the sweep's unit of work: for each object
 * key, `findMemeByMediaKey` says whether a meme still claims it, and that
 * answer sorts the key into keep/delete per the rules on
 * `sweepOrphanedR2Objects`.
 */
export const findMemeByMediaKey = internalQuery({
  args: { mediaKey: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("memes"),
      status: v.union(
        v.literal("draft"),
        v.literal("processing"),
        v.literal("ready"),
        v.literal("failed"),
        v.literal("deleted"),
      ),
      deletedAt: v.optional(v.number()),
      reclaimJobId: v.optional(v.id("_scheduled_functions")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    // `.first()`, not `.unique()`: a sweep is best-effort cleanup, not a
    // consistency check, so a hypothetical duplicate key must not throw and
    // abort the whole run. Every write path only ever assigns a freshly
    // generated key to one meme, so duplicates are not expected in practice.
    const meme = await ctx.db
      .query("memes")
      .withIndex("by_mediaKey", (q) => q.eq("mediaKey", args.mediaKey))
      .first();
    if (meme === null) return null;
    return {
      _id: meme._id,
      status: meme.status,
      deletedAt: meme.deletedAt,
      reclaimJobId: meme.reclaimJobId,
    };
  },
});

// How many objects `sweepOrphanedR2Objects` reads from R2 per `listMetadata`
// call. Matches the component's own default so the sweep doesn't need a
// justification for a different number.
const SWEEP_PAGE_SIZE = 10;

// A never-claimed object (no meme row references its key at all) is only
// deleted once it's older than this. `createMeme` uploads the object *before*
// inserting the meme row (see its docstring), so a legitimate in-flight
// publish briefly looks identical to an abandoned upload. An hour is far
// longer than that window ever takes end-to-end, while still being much
// shorter than the sweep's own cadence (`convex/crons.ts`), so an abandoned
// upload never survives more than roughly one extra sweep cycle.
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

// Extra buffer past `DELETE_UNDO_WINDOW_MS` before the sweep will reclaim a
// `deleted` meme that *still* has a `reclaimJobId`. Normally that job fires
// and clears the field well within this margin; a meme still holding one this
// long past its window means the scheduled job itself failed to run (not the
// failure mode #81 targets, but the same orphaned-object symptom), so the
// sweep finishes the job itself via the same `reclaimDeletedMeme` path rather
// than racing a reclaim that's merely running a little late.
const RECLAIM_STALL_MARGIN_MS = 60 * 60 * 1000;

/**
 * Periodic sweep for orphaned R2 objects (#81). Walks every object in the
 * bucket via `r2.listMetadata` and, per key, decides:
 *
 * - No meme row claims the key, and it's older than `ORPHAN_GRACE_MS` ->
 *   delete. (Abandoned upload, or the #81 failure mode where `deleteObject`
 *   already fired once and threw after the meme's own row was long gone.)
 * - A meme claims the key and isn't `deleted` -> keep. It's a live object.
 * - A `deleted` meme claims the key with no `reclaimJobId` -> delete. This is
 *   the #81 failure mode in the common case: `finalizeReclaim` committed
 *   (which is what clears `reclaimJobId`) but the `r2.deleteObject` call
 *   right after it threw.
 * - A `deleted` meme claims the key and still has a `reclaimJobId`, within
 *   `DELETE_UNDO_WINDOW_MS + RECLAIM_STALL_MARGIN_MS` of `deletedAt` -> keep.
 *   Still inside (or just past) the undo window; the scheduled job owns it.
 * - Same, but past that margin -> delete via `internal.memes.reclaimDeletedMeme`,
 *   reusing its finalize-then-delete ordering, on the assumption the
 *   originally scheduled job itself failed to run. If it turns out that job
 *   was merely delayed and fires later anyway, `finalizeReclaim`'s guard
 *   makes the second run a clean no-op (ADR 0013) rather than a double delete.
 *
 * Every per-object step is wrapped so one failing delete (e.g. a transient R2
 * error) can't abort the rest of the page — the next cron tick will simply
 * see the same object again, since nothing here depends on sweep-to-sweep
 * state.
 */
export const sweepOrphanedR2Objects = internalAction({
  args: {},
  returns: v.object({ scanned: v.number(), deleted: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    let scanned = 0;
    let deleted = 0;
    let cursor: string | null = null;
    let isDone = false;

    while (!isDone) {
      const page = await r2.listMetadata(ctx, SWEEP_PAGE_SIZE, cursor);
      for (const object of page.page) {
        scanned++;
        try {
          const meme = await ctx.runQuery(
            internal.storageSweep.findMemeByMediaKey,
            { mediaKey: object.key },
          );

          if (meme === null) {
            const uploadedAt = Date.parse(object.lastModified);
            const ageMs = Number.isNaN(uploadedAt)
              ? Infinity
              : now - uploadedAt;
            if (ageMs < ORPHAN_GRACE_MS) continue;
            await r2.deleteObject(ctx, object.key);
            deleted++;
            continue;
          }

          if (meme.status !== "deleted") continue;

          if (meme.reclaimJobId === undefined) {
            await r2.deleteObject(ctx, object.key);
            deleted++;
            continue;
          }

          const deletedAt = meme.deletedAt ?? now;
          if (
            now - deletedAt >
            DELETE_UNDO_WINDOW_MS + RECLAIM_STALL_MARGIN_MS
          ) {
            await ctx.runAction(internal.memes.reclaimDeletedMeme, {
              memeId: meme._id,
            });
            deleted++;
          }
        } catch (error) {
          console.error(
            `storageSweep: failed to sweep R2 object ${object.key}`,
            error,
          );
        }
      }

      isDone = page.isDone;
      cursor = page.continueCursor;
    }

    return { scanned, deleted };
  },
});
