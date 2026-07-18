import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Cleanup for the R2-orphan failure mode #81 describes (`finalizeReclaim`
// commits, then `r2.deleteObject` throws): see `convex/storageSweep.ts` for
// the full decision. Six hours keeps an orphan's worst-case lifetime well
// under a day without scanning the bucket so often that it becomes the
// bucket's dominant source of R2 API calls.
crons.interval(
  "sweep orphaned r2 objects",
  { hours: 6 },
  internal.storageSweep.sweepOrphanedR2Objects,
  {},
);

export default crons;
