import { defineSchema, defineTable } from "convex/server";

import { v } from "convex/values";

export default defineSchema({
  memes: defineTable({
    title: v.optional(v.string()),
    visibility: v.union(v.literal("public"), v.literal("private")),
    status: v.union(
      v.literal("draft"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
      v.literal("deleted"),
    ),
    mediaUrl: v.string(),
    mediaType: v.union(
      v.literal("image"),
      v.literal("gif"),
      v.literal("video"),
    ),
    tags: v.array(v.string()),
    authorName: v.string(),
    upvoteCount: v.number(),
    downvoteCount: v.number(),
  }).index("by_visibility_and_status", ["visibility", "status"]),
});
