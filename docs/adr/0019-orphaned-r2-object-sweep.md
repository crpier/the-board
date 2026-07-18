# ADR 0019 - Orphaned R2 Object Sweep

Date: 2026-07-18
Status: accepted

## Context

ADR 0013 moved R2 reclaim onto a scheduled action: `reclaimDeletedMeme` calls
`finalizeReclaim` (an internal mutation that commits first, clearing
`reclaimJobId`) and then `r2.deleteObject` as a separately-committed step. If
that `r2.deleteObject` call throws, the meme's tombstone is permanently
correct, but the R2 object it pointed at is now orphaned — nothing retries the
delete. ADR 0009 already accepted this failure mode for the old synchronous
path, so it is not a regression, but it now lives in a background action where
a failure is far less visible than a failed request in the original
synchronous flow.

Issue #81 asks for a periodic sweep that finds and removes exactly these
orphaned objects.

## Decision

**A `convex/crons.ts` cron runs `storageSweep.sweepOrphanedR2Objects` every 6
hours.** The sweep walks the entire bucket via the R2 component's
`listMetadata`, and for each object key looks up the (at most one) meme row
that claims it via a new `by_mediaKey` index. Per key:

- No meme claims it, and it's older than an hour -> delete. `createMeme`
  uploads the object _before_ inserting the meme row, so a legitimate
  in-flight publish briefly looks identical to an abandoned upload; the grace
  period tells them apart without needing any extra state.
- A meme claims it and isn't `deleted` -> keep.
- A `deleted` meme claims it with no `reclaimJobId` -> delete. This is the
  exact #81 failure mode: `finalizeReclaim` already committed (which is what
  clears `reclaimJobId`), so the object is definitely stale.
- A `deleted` meme claims it and still has a `reclaimJobId`, within
  `DELETE_UNDO_WINDOW_MS` (24h, ADR 0013) plus a one-hour safety margin of
  `deletedAt` -> keep. The scheduled job still owns it.
- Same, but past that margin -> reclaim it now via
  `internal.memes.reclaimDeletedMeme`, on the assumption the originally
  scheduled job itself failed to run (a different, rarer failure than #81, but
  the same orphaned-object symptom). `finalizeReclaim`'s existing guard makes
  it safe if the original job turns out to just be running late: its second
  invocation is a clean no-op rather than a double delete.

Every per-object step is wrapped in its own `try`/`catch` so one failing
delete can't abort the rest of a run; the next cron tick sees the same object
again since the sweep carries no state between runs.

**Cadence and safety margins are constants, not configuration**, matching how
`DELETE_UNDO_WINDOW_MS` is handled in ADR 0013. Six hours keeps an orphan's
worst-case lifetime comfortably under a day without the sweep becoming the
bucket's dominant source of R2 API traffic; the one-hour grace/margin values
are generous relative to how long a real publish or reclaim ever takes.

## Consequences

- The sweep is a full bucket scan every 6 hours (paginated via
  `r2.listMetadata`), not an incremental/indexed one — there is no reverse
  index from "R2 objects" to "memes" on the R2 side, only the other direction
  (`by_mediaKey`) that this ADR adds. This is fine at the app's current scale;
  if the bucket grows large enough for a full scan every 6 hours to become
  expensive, revisit toward a queue-based retry of the specific failed
  `deleteObject` call instead of a bucket-wide sweep.
- The `by_mediaKey` index also makes "does any meme claim this key" a cheap,
  indexed lookup anywhere else it's needed in the future, not just in the
  sweep.
- A meme whose `reclaimDeletedMeme` job is merely slow (not actually failed)
  and fires between the sweep's stall check and its own run is not a bug: the
  second `finalizeReclaim` call is a no-op by construction (ADR 0013), so at
  worst the object is deleted slightly earlier than the original job would
  have.
