import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";

import { v } from "convex/values";

import {
  mediaTypeValidator,
  reportReasonValidator,
  reportStatusValidator,
  visibilityValidator,
} from "./validators";

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
    // Uniform-random tiebreaker (ADR 0014) backing the "Random" nav action
    // (#66). Assigned once at insert (`Math.random()`) and never rewritten, so
    // it has no relation to recency or any other field. Optional for the same
    // reason `searchText` is: the field ships before the backfill populates
    // pre-existing rows, and a missing value is treated as sorting first
    // (reachable via `getRandomMeme`'s wraparound, not lost).
    randomKey: v.optional(v.number()),
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
    // When a `deleted` meme was tombstoned (ADR 0009). Undefined for every
    // non-deleted meme. Paired with `reclaimJobId` to gate the undo window: set
    // together by `deleteMeme`, cleared together by `restoreMeme`.
    deletedAt: v.optional(v.number()),
    // Id of the scheduled `reclaimDeletedMeme` job that will delete the R2
    // object once the undo window elapses. Its presence *is* the undo window:
    // `restoreMeme` requires it (and cancels it), and the reclaim job clears it
    // before touching R2 so a restored meme can never be reclaimed out from
    // under the owner. Undefined once reclaimed (or for a never-deleted meme).
    reclaimJobId: v.optional(v.id("_scheduled_functions")),
    // Authoritative author reference. Display name is resolved live from the
    // user row (`displayName ?? name`) at read time, never denormalized onto
    // the meme.
    authorId: v.id("users"),
    upvoteCount: v.number(),
    downvoteCount: v.number(),
  })
    .index("by_visibility_and_status", ["visibility", "status"])
    // Backs `getRandomMeme` (#66, ADR 0014): a random-key index seek instead of
    // a full table scan. `randomKey` must be last so `.gte("randomKey", seed)`
    // seeks within the public+ready partition in index order.
    .index("by_visibility_and_status_and_randomKey", [
      "visibility",
      "status",
      "randomKey",
    ])
    // Backs the orphan sweep (`storageSweep.sweepOrphanedR2Objects`, #81):
    // given an R2 object key, find the (at most one) meme row that claims it.
    .index("by_mediaKey", ["mediaKey"])
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
  // Reusable base images for the Meme Creator (#84, ADR 0019). A template is a
  // deliberately thin cousin of a meme: it has no votes, no visibility (always
  // public), and no feed presence, but reuses the meme media/lifecycle
  // mechanics wholesale — presigned-R2-PUT upload, owner soft-delete + undo +
  // delayed R2 reclaim, admin removal, and reporting. The composed meme that a
  // template helps produce is a plain uploaded meme with no link back here
  // (backend-blind creator, ADR 0019), so there is no foreign key from `memes`
  // to `templates` and no usage tracking.
  templates: defineTable({
    // Required short human name, shown in the picker and searched on. Trimmed
    // and length-capped server-side in `createTemplate`.
    name: v.string(),
    // Denormalized lowercase name backing `search_name`, mirroring `memes`'
    // `searchText`. Optional so the field can ship before a backfill; a missing
    // value simply never matches a search.
    searchText: v.optional(v.string()),
    // R2 object key for the base image, resolved to a CDN URL at read time
    // exactly like `memes.mediaKey` (ADR 0005). Raw keys never leave a query.
    mediaKey: v.string(),
    // Always `"image"` in v1 (static images only — GIF/video are rejected), but
    // typed with the shared validator so the media rules stay identical to
    // memes and a future relaxation is a one-line change.
    mediaType: mediaTypeValidator,
    // Templates skip the meme `processing`/`ready` dance — they are inserted
    // ready — but reuse the `deleted` tombstone so soft-delete + undo + reclaim
    // work identically (ADR 0009/0013).
    status: v.union(v.literal("ready"), v.literal("deleted")),
    authorId: v.id("users"),
    // Soft-delete tombstone + undo-window plumbing, identical semantics to
    // `memes` (ADR 0013): set together by a delete, cleared together by a
    // restore, and `reclaimJobId`'s presence *is* the undo window.
    deletedAt: v.optional(v.number()),
    reclaimJobId: v.optional(v.id("_scheduled_functions")),
  })
    // Backs the newest-first picker grid: ready templates, `_creationTime`
    // descending via the index's built-in trailing key.
    .index("by_status", ["status"])
    .index("by_author", ["authorId"])
    // Orphan-sweep parity with `memes.by_mediaKey` (#81): given an R2 key, find
    // the template that claims it.
    .index("by_mediaKey", ["mediaKey"])
    // Name search for the picker (ADR 0010-style single relevance index).
    // `status` is the one filter so deleted templates never surface.
    .searchIndex("search_name", {
      searchField: "searchText",
      filterFields: ["status"],
    }),
  votes: defineTable({
    userId: v.id("users"),
    memeId: v.id("memes"),
    value: v.union(v.literal("up"), v.literal("down")),
  })
    .index("by_user_and_meme", ["userId", "memeId"])
    .index("by_meme", ["memeId"]),
  // User reports feeding the admin review queue (#67). No `createdAt` field —
  // `_creationTime` already gives every doc an ordered timestamp, so a second
  // one would just be a redundant copy (unlike `resolvedBy`, which records a
  // fact `_creationTime` can't: *who* resolved it).
  reports: defineTable({
    reporterId: v.id("users"),
    // A report targets exactly one entity, discriminated by which foreign key
    // is present: `memeId` for a meme report, `templateId` for a template
    // report (#84, ADR 0019). Both are optional rather than a discriminated
    // union so the extension is migration-free — existing meme reports (which
    // carry `memeId` and no `templateId`) validate unchanged, and no
    // `targetType` field has to be backfilled. Callers set exactly one; the
    // read models switch on presence.
    memeId: v.optional(v.id("memes")),
    templateId: v.optional(v.id("templates")),
    reason: reportReasonValidator,
    details: v.optional(v.string()),
    status: reportStatusValidator,
    // Set when an admin resolves or dismisses the report; absent while `open`.
    resolvedBy: v.optional(v.id("users")),
  })
    // Backs the admin queue: open reports, oldest first.
    .index("by_status", ["status"])
    // Backs the duplicate-report guard in `createReport`: does this reporter
    // already have an open report on this meme?
    .index("by_meme_and_reporter_and_status", [
      "memeId",
      "reporterId",
      "status",
    ])
    // Same duplicate-report guard for template reports (#84).
    .index("by_template_and_reporter_and_status", [
      "templateId",
      "reporterId",
      "status",
    ]),
});
