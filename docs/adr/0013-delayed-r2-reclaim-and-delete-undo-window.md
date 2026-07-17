# ADR 0013 - Delayed R2 Reclaim and a Delete Undo Window

Date: 2026-07-17
Status: accepted

## Context

ADR 0009 made delete a soft tombstone (`status = "deleted"`) but reclaimed the
R2 object **synchronously**, in the same `deleteMeme` action, and explicitly
called out "no restore UI; a delayed-reclaim undo window is future work". The
client paired this with a blocking browser `confirm()` — the only "are you
sure" available, and the only safety net, since a confirmed delete was
immediately unrecoverable.

Issue #71 asks for both: an in-app confirmation modal, and an actual undo
window before the object is gone. The second one is the durable decision —
once R2 reclaim is asynchronous, the row/action shapes ADR 0009 established
need to change to accommodate it.

## Decision

**Reclaim moves onto a scheduled job; `deleteMeme` becomes a plain mutation.**
`deleteMeme` now only flips `status = "deleted"`, stamps `deletedAt`, and
schedules `reclaimDeletedMeme` (an internal action) `DELETE_UNDO_WINDOW_MS`
(24 hours) out via `ctx.scheduler.runAfter`. It no longer needs to be an
action — the R2 side effect that forced that shape in ADR 0009 is now the
scheduled job's job, not the mutation's. `reclaimDeletedMeme` mirrors the old
`deleteMeme`/`tombstoneMeme` split: an internal mutation
(`finalizeReclaim`) does the transactional guard-and-clear first, and the
action deletes the object as a separately-committed step, preserving ADR
0009's "commit before touching R2" ordering.

**The scheduled job's id, stored as `reclaimJobId`, _is_ the undo window.**
A meme is restorable exactly when `status === "deleted"` and `reclaimJobId`
is still set. `restoreMeme` (owner-only) cancels that job
(`ctx.scheduler.cancel`) and flips the meme back to `ready`, clearing both
`deletedAt` and `reclaimJobId`. `finalizeReclaim` re-checks the same
condition before touching R2, so a job that fires after a race-y restore (or
a duplicate run) is a clean no-op instead of reclaiming a live meme or
double-deleting an already-reclaimed one.

**The confirmation modal is a plain client-side component, not a new
dependency.** No dialog/modal library existed in this codebase; `confirm()` is
replaced by a small `ConfirmDialog` built on `solid-js/web`'s `Portal`, styled
to match the rest of the app. It is not a full focus-trap implementation —
initial focus on the confirm button, `Escape`, and a backdrop click cover the
common cases without pulling in a dependency for one call site.

**Undo is surfaced as a toast, not a "trash" browsing surface.** After a
successful delete, a global toast (mounted once above the router) offers
"Undo" for the deleted meme. This exercises `restoreMeme` immediately after
delete, the moment a user is most likely to want it. It deliberately does
**not** add a page for browsing/restoring memes deleted in a previous session
— the mutation supports that (any owner-authored restore call within the
window works from anywhere), but the read surface for it is future work if
it's ever needed.

## Consequences

- `deleteMeme` losing its action-ness is a meaningful simplification: the
  common path (delete, no undo) is now a single transactional mutation
  instead of a mutation-then-R2-call pair, and it no longer has a partial-
  failure mode to reason about (a mutation either commits or it doesn't). The
  R2 side effect's partial-failure mode still exists, but it's now isolated to
  the scheduled job, 24 hours removed from the user-facing request.
- The 24-hour window is a constant (`DELETE_UNDO_WINDOW_MS` in
  `convex/memes.ts`), not configurable per-meme or per-user. Changing it later
  only affects future deletes; it does not retroactively reschedule
  in-flight jobs.
- Tests can't wait out a real 24-hour `setTimeout` (convex-test schedules
  jobs with real delays). They invoke `internal.memes.reclaimDeletedMeme`
  directly to simulate "the window elapsed" rather than driving the actual
  scheduler clock.
- A meme's `mediaUrl` keeps resolving during the undo window (the R2 object is
  untouched until reclaim), but the meme itself is already invisible
  everywhere reads are filtered on `status = "ready"` — restoring it is the
  only way to see it again, matching ADR 0009's original hiding behavior.
- No new runtime dependency was added for the modal. If a second, more complex
  dialog need shows up later, revisit whether a real dialog primitive
  (headless UI, `<dialog>` + `showModal()`) is worth adopting instead of a
  second hand-rolled component.
