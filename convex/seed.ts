import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";
import { r2 } from "./r2";
import { SEED_MEMES } from "./seedAssets";

/**
 * Dev-only seed (issue #32): repopulate a wiped feed without the upload UI.
 *
 * Run it against a **dev** deployment with:
 *
 *     pnpm convex run seed:seed
 *
 * It uploads the bundled sample media (`./seedAssets`) to the dev R2 bucket and
 * publishes a meme per sample, owned by the first (auto-admin) user, then seeds a
 * spread of votes so the feed shows real aggregates. Uploads go through the same
 * `r2.store` path as real publishes, and inserts reuse the real
 * `insertProcessingMeme` lifecycle (insert → schedule → flip to `ready`), so the
 * seeded feed renders and behaves like one built through the UI and exercises the
 * view-model resolver and voting end to end.
 *
 * Three deliberate shortcuts vs. the UI path: it skips `createMeme`'s
 * server-authoritative re-validation (size/content-type) and tag canonicalization
 * — the bundled samples are valid and `SEED_MEMES` tags are already canonical —
 * it passes `skipRateLimit: true` to `insertProcessingMeme` since a seed batch
 * routinely exceeds the 10/hour `uploadMeme` budget and isn't a real user
 * action (#69), and it seeds votes through a dedicated internal mutation
 * rather than `castVote` (which needs an authenticated caller). All three keep
 * the seed self-contained.
 *
 * It is **not** idempotent: each run appends a fresh batch. After a wipe that is
 * exactly what you want; to re-seed cleanly, wipe first. It is gated to internal
 * functions (no public API surface) but is otherwise undefended against being
 * pointed at prod, so don't.
 */

/**
 * Decode base64 to bytes in the default Convex runtime (no Node `Buffer`).
 * `atob` yields a binary string; we widen each char code back into a byte.
 */
function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const seed = internalAction({
  args: {},
  returns: v.object({ created: v.number(), authorId: v.id("users") }),
  handler: async (ctx): Promise<{ created: number; authorId: Id<"users"> }> => {
    const authorId: Id<"users"> = await ctx.runMutation(
      internal.seed.ensureSeedUser,
      {},
    );

    // Votes are one-per-user-per-meme, so mint a voter pool large enough for the
    // meme with the most votes; each meme draws its up/down voters from the pool.
    const voterCount = SEED_MEMES.reduce(
      (max, spec) =>
        Math.max(max, (spec.votes?.up ?? 0) + (spec.votes?.down ?? 0)),
      0,
    );
    const voterIds: Id<"users">[] = await ctx.runMutation(
      internal.seed.ensureSeedVoters,
      { count: voterCount },
    );

    for (const spec of SEED_MEMES) {
      // Upload the bytes to R2 first (real key), then bind a meme to that key —
      // the same ordering the upload flow uses. `r2.store` also syncs the
      // object's metadata, so the published meme has a resolvable CDN URL.
      const mediaKey = await r2.store(ctx, decodeBase64(spec.sample.base64), {
        type: spec.sample.contentType,
      });
      const memeId: Id<"memes"> = await ctx.runMutation(
        internal.memes.insertProcessingMeme,
        {
          authorId,
          mediaKey,
          mediaType: spec.sample.mediaType,
          title: spec.title,
          tags: spec.tags,
          visibility: spec.visibility,
          // The seed batch routinely exceeds the 10/hour `uploadMeme` budget
          // and isn't a real user action, so it must not be throttled (#69).
          skipRateLimit: true,
        },
      );
      if (spec.votes !== undefined) {
        await ctx.runMutation(internal.seed.seedVotes, {
          memeId,
          voterIds,
          up: spec.votes.up,
          down: spec.votes.down,
        });
      }
    }

    console.log(
      `Seeded ${SEED_MEMES.length} memes owned by user ${authorId}. ` +
        "The lifecycle stub flips each from processing → ready momentarily.",
    );
    return { created: SEED_MEMES.length, authorId };
  },
});

/**
 * Resolve the owner for seeded memes: the first (auto-admin) user, matching the
 * "first user is admin" rule in `convex/auth.ts`. If the wipe cleared `users`
 * too, mint a stand-in admin so the seed still produces a renderable feed; a
 * later real sign-in becomes a normal, non-first user.
 */
export const ensureSeedUser = internalMutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx): Promise<Id<"users">> => {
    const firstUser = await ctx.db.query("users").order("asc").first();
    if (firstUser !== null) {
      return firstUser._id;
    }
    return await ctx.db.insert("users", {
      name: "Dev Seed User",
      isAdmin: true,
    });
  },
});

/**
 * Mint a pool of non-admin "dev voter" users for seeding votes. Always inserts
 * fresh rows (the seed isn't idempotent) and runs after `ensureSeedUser`, so it
 * never displaces the first/auto-admin owner. Returns their ids in order.
 */
export const ensureSeedVoters = internalMutation({
  args: { count: v.number() },
  returns: v.array(v.id("users")),
  handler: async (ctx, args): Promise<Id<"users">[]> => {
    const ids: Id<"users">[] = [];
    for (let i = 0; i < args.count; i++) {
      ids.push(await ctx.db.insert("users", { name: `Dev Voter ${i + 1}` }));
    }
    return ids;
  },
});

/**
 * Seed a meme's votes: insert one `up` row per voter from the front of the pool
 * and one `down` row per voter after them, then set the denormalized counts to
 * match. Mirrors `castVote`'s invariant that the counts equal the vote-row total
 * (ADR 0004); it is a dev-only second writer of those counts because `castVote`
 * requires an authenticated caller, which an action can't impersonate.
 */
export const seedVotes = internalMutation({
  args: {
    memeId: v.id("memes"),
    voterIds: v.array(v.id("users")),
    up: v.number(),
    down: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (let i = 0; i < args.up; i++) {
      await ctx.db.insert("votes", {
        userId: args.voterIds[i],
        memeId: args.memeId,
        value: "up",
      });
    }
    for (let i = 0; i < args.down; i++) {
      await ctx.db.insert("votes", {
        userId: args.voterIds[args.up + i],
        memeId: args.memeId,
        value: "down",
      });
    }
    await ctx.db.patch(args.memeId, {
      upvoteCount: args.up,
      downvoteCount: args.down,
    });
    return null;
  },
});
