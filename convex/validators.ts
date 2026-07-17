import { type Infer, v } from "convex/values";

/**
 * Shared literal-set validators for meme fields. The schema, the read
 * view-model, and the write path all import these so the accepted literals are
 * declared once and can't drift apart.
 */
export const mediaTypeValidator = v.union(
  v.literal("image"),
  v.literal("gif"),
  v.literal("video"),
);

export const visibilityValidator = v.union(
  v.literal("public"),
  v.literal("private"),
);

/**
 * The reasons a viewer can cite when reporting a meme (#67), lifted from the
 * house rules in `docs/product-overview.md` (illegal content, harassment, hate
 * speech, spam/duplicate) plus a catch-all. Shared by the report mutation and
 * the admin queue's read-model so the accepted set can't drift between them.
 */
export const reportReasonValidator = v.union(
  v.literal("spam"),
  v.literal("harassment"),
  v.literal("hate_speech"),
  v.literal("illegal_content"),
  v.literal("other"),
);

/**
 * A report's lifecycle: `open` until an admin acts, then `resolved` (the
 * reported meme was hidden) or `dismissed` (no action taken). There is no
 * reopen path — resolving is final, mirroring the "admin visibility decisions
 * are final" house rule.
 */
export const reportStatusValidator = v.union(
  v.literal("open"),
  v.literal("resolved"),
  v.literal("dismissed"),
);

// Client-shared types inferred from the validators above, so a UI reason
// select or status switch can't silently drift from the accepted literals.
export type ReportReason = Infer<typeof reportReasonValidator>;
export type ReportStatus = Infer<typeof reportStatusValidator>;
