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
 *     npx convex run seed:seed
 *
 * It uploads the bundled sample media (`./seedAssets`) to the dev R2 bucket and
 * publishes a meme per sample, owned by the first (auto-admin) user. Uploads go
 * through the same `r2.store` path as real publishes, and inserts reuse the real
 * `insertProcessingMeme` lifecycle (insert → schedule → flip to `ready`), so the
 * seeded feed is indistinguishable from one built through the UI and exercises
 * the view-model resolver and voting end to end.
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

    for (const spec of SEED_MEMES) {
      // Upload the bytes to R2 first (real key), then bind a meme to that key —
      // the same ordering the upload flow uses. `r2.store` also syncs the
      // object's metadata, so the published meme has a resolvable CDN URL.
      const mediaKey = await r2.store(ctx, decodeBase64(spec.sample.base64), {
        type: spec.sample.contentType,
      });
      await ctx.runMutation(internal.memes.insertProcessingMeme, {
        authorId,
        mediaKey,
        mediaType: spec.sample.mediaType,
        title: spec.title,
        tags: spec.tags,
        visibility: spec.visibility,
      });
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
