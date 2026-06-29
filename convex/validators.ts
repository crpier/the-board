import { v } from "convex/values";

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
