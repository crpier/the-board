import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";

import { v } from "convex/values";

import { mediaTypeValidator, visibilityValidator } from "./validators";

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    // User-set display-name override. `name` stays OAuth-managed — the auth
    // provider rewrites it from the Google profile on every sign-in — so a
    // user-chosen name must live in its own field (ADR 0011). Display
    // resolution everywhere is `displayName ?? name ?? "Anon"`.
    displayName: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),

    isAdmin: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    // Backs the admin roster (`users.listUsers`, #68) and the last-admin
    // guard in `demoteUser`, which needs a cheap "how many admins are there"
    // check without a table scan.
    .index("by_isAdmin", ["isAdmin"]),
  memes: defineTable({
    title: v.optional(v.string()),
    // Denormalized full-text search blob: title + canonicalized tags joined by
    // spaces (author excluded — see ADR 0010). Computed on every title/tags
    // write via `buildSearchText`. Optional so the field can ship before the
    // backfill populates pre-existing rows; a missing value simply never
    // matches a search.
    searchText: v.optional(v.string()),
    visibility: visibilityValidator,
    status: v.union(
      v.literal("draft"),
      v.literal("processing"),
      v.literal("ready"),
      v.literal("failed"),
      v.literal("deleted"),
    ),
    // R2 object key for the primary media item; resolved to a CDN URL at read
    // time (ADR 0005). Raw keys never leave a query — reads return a view-model.
    mediaKey: v.string(),
    mediaType: mediaTypeValidator,
    tags: v.array(v.string()),
    // Authoritative author reference. Display name is resolved live from the
    // user row (`displayName ?? name`) at read time, never denormalized onto
    // the meme.
    authorId: v.id("users"),
    upvoteCount: v.number(),
    downvoteCount: v.number(),
  })
    .index("by_visibility_and_status", ["visibility", "status"])
    .index("by_author", ["authorId"])
    .index("by_author_and_status", ["authorId", "status"])
    .index("by_author_and_visibility_and_status", [
      "authorId",
      "visibility",
      "status",
    ])
    // Single search index backing `/search` (ADR 0010). `mediaType` is the one
    // refinement filter; `visibility`/`status` are pinned to public+ready for
    // every viewer so private/non-ready memes never surface.
    .searchIndex("search_searchText", {
      searchField: "searchText",
      filterFields: ["visibility", "status", "mediaType"],
    }),
  votes: defineTable({
    userId: v.id("users"),
    memeId: v.id("memes"),
    value: v.union(v.literal("up"), v.literal("down")),
  })
    .index("by_user_and_meme", ["userId", "memeId"])
    .index("by_meme", ["memeId"]),
});
