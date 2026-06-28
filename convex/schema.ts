import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";

import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    isAdmin: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
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
  votes: defineTable({
    userId: v.id("users"),
    memeId: v.id("memes"),
    value: v.union(v.literal("up"), v.literal("down")),
  })
    .index("by_user_and_meme", ["userId", "memeId"])
    .index("by_meme", ["memeId"]),
});
