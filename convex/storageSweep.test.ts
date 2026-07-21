/// <reference types="vite/client" />
import actionRetrier from "@convex-dev/action-retrier/test";
import r2Test from "@convex-dev/r2/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Mirrors `DELETE_UNDO_WINDOW_MS` in `convex/memes.ts`. Deliberately not
// imported from there: a static import of `./memes` would eagerly evaluate
// `./r2` (for its module-level `r2 = new R2(...)` singleton) before the
// `process.env.R2_*` assignments below run, leaving the R2 client configured
// with an undefined bucket for the rest of the test file.
const DELETE_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

// See memes.test.ts: the `r2` client reads its bucket credentials from the
// deployment env at module construction, so these must be set before any
// Convex function loads.
process.env.R2_BUCKET = "test-bucket";
process.env.R2_ENDPOINT = "https://test.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";

const MB = 1024 * 1024;

/** Stand up an instance with the R2 component (and its retrier) mounted. */
function setup() {
  const t = convexTest(schema, modules);
  r2Test.register(t);
  actionRetrier.register(t, "r2/actionRetrier");
  return t;
}

/** Seed R2 metadata for `key` as if a real object had been uploaded. */
function seedObject(
  t: ReturnType<typeof convexTest>,
  key: string,
  lastModified: Date,
) {
  return t.run(async (ctx) => {
    await ctx.runMutation(components.r2.lib.upsertMetadata, {
      key,
      bucket: "test-bucket",
      contentType: "image/png",
      size: MB,
      lastModified: lastModified.toISOString(),
      link: `https://dash.example/objects/${key}/details`,
    });
  });
}

function objectExists(t: ReturnType<typeof convexTest>, key: string) {
  return t.run(async (ctx) => {
    const metadata = await ctx.runQuery(components.r2.lib.getMetadata, {
      key,
      bucket: "test-bucket",
      endpoint: process.env.R2_ENDPOINT!,
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    });
    return metadata !== null;
  });
}

async function seedMeme(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { name: "Tester" });
  });
  const memeId = await t.run(async (ctx) => {
    return await ctx.db.insert("memes", {
      visibility: "public",
      status: "ready",
      mediaKey: "memes/abc.png",
      mediaType: "image",
      tags: [],
      authorId: userId,
      upvoteCount: 0,
      downvoteCount: 0,
      ...overrides,
    });
  });
  return { userId, memeId };
}

function getMeme(t: ReturnType<typeof convexTest>, memeId: Id<"memes">) {
  return t.run(async (ctx) => ctx.db.get(memeId));
}

async function seedTemplate(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { name: "Tester" });
  });
  const templateId = await t.run(async (ctx) => {
    return await ctx.db.insert("templates", {
      name: "Base",
      searchText: "base",
      status: "ready",
      mediaKey: "templates/abc.png",
      mediaType: "image",
      authorId: userId,
      ...overrides,
    });
  });
  return { userId, templateId };
}

function getTemplate(
  t: ReturnType<typeof convexTest>,
  templateId: Id<"templates">,
) {
  return t.run(async (ctx) => ctx.db.get(templateId));
}

describe("sweepOrphanedR2Objects", () => {
  test("deletes an object with no meme row, once past the grace period", async () => {
    const t = setup();
    const key = "memes/orphan.png";
    // Well older than ORPHAN_GRACE_MS (1 hour) so it doesn't look like an
    // in-flight upload.
    await seedObject(t, key, new Date(Date.now() - 2 * 60 * 60 * 1000));

    const result = await t.action(
      internal.storageSweep.sweepOrphanedR2Objects,
      {},
    );

    expect(result.deleted).toBe(1);
    expect(await objectExists(t, key)).toBe(false);
  });

  test("keeps a freshly uploaded object with no meme row yet", async () => {
    const t = setup();
    const key = "memes/mid-publish.png";
    // Uploaded moments ago: looks like an upload that's still mid-`createMeme`.
    await seedObject(t, key, new Date());

    const result = await t.action(
      internal.storageSweep.sweepOrphanedR2Objects,
      {},
    );

    expect(result.deleted).toBe(0);
    expect(await objectExists(t, key)).toBe(true);
  });

  test("keeps an object referenced by a live meme", async () => {
    const t = setup();
    const key = "memes/live.png";
    await seedMeme(t, { mediaKey: key, status: "ready" });
    await seedObject(t, key, new Date(Date.now() - 2 * 60 * 60 * 1000));

    const result = await t.action(
      internal.storageSweep.sweepOrphanedR2Objects,
      {},
    );

    expect(result.deleted).toBe(0);
    expect(await objectExists(t, key)).toBe(true);
  });

  test("keeps an object referenced by a live template", async () => {
    // Templates share the bucket with memes but aren't claimed by any meme
    // row, so without the template-claim check the sweep would delete this
    // live base image as an orphan (#84).
    const t = setup();
    const key = "templates/live.png";
    await seedTemplate(t, { mediaKey: key, status: "ready" });
    await seedObject(t, key, new Date(Date.now() - 2 * 60 * 60 * 1000));

    const result = await t.action(
      internal.storageSweep.sweepOrphanedR2Objects,
      {},
    );

    expect(result.deleted).toBe(0);
    expect(await objectExists(t, key)).toBe(true);
  });

  test("deletes a deleted template's object stranded with no reclaimJobId", async () => {
    const t = setup();
    const key = "templates/stranded.png";
    const { templateId } = await seedTemplate(t, {
      mediaKey: key,
      status: "deleted",
      deletedAt: Date.now(),
      // No reclaimJobId: finalizeTemplateReclaim already cleared it, but the
      // object delete that should have followed never happened.
    });
    await seedObject(t, key, new Date(Date.now() - 2 * 60 * 60 * 1000));

    const result = await t.action(
      internal.storageSweep.sweepOrphanedR2Objects,
      {},
    );

    expect(result.deleted).toBe(1);
    expect(await objectExists(t, key)).toBe(false);
    expect((await getTemplate(t, templateId))?.status).toBe("deleted");
  });

  test("deletes an object left behind when finalizeReclaim committed but deleteObject previously failed", async () => {
    const t = setup();
    const key = "memes/stranded.png";
    const { memeId } = await seedMeme(t, {
      mediaKey: key,
      status: "deleted",
      deletedAt: Date.now(),
      // No reclaimJobId: finalizeReclaim already cleared it, but the object
      // delete that should have followed never actually happened.
    });
    await seedObject(t, key, new Date(Date.now() - 2 * 60 * 60 * 1000));

    const result = await t.action(
      internal.storageSweep.sweepOrphanedR2Objects,
      {},
    );

    expect(result.deleted).toBe(1);
    expect(await objectExists(t, key)).toBe(false);
    expect((await getMeme(t, memeId))?.status).toBe("deleted");
  });

  test("keeps a deleted meme's object while still inside the undo window", async () => {
    const key = "memes/undo.png";
    const t = setup();
    const { userId, memeId } = await seedMeme(t, { mediaKey: key });
    await seedObject(t, key, new Date(Date.now() - 2 * 60 * 60 * 1000));
    const asOwner = t.withIdentity({ subject: `${userId}|session` });

    // Real delete, so `reclaimJobId` is a genuine scheduled-function id (as
    // ADR 0013 notes, convex-test can't fast-forward the real 24h timer, so
    // the scheduled job never actually fires in this test).
    await asOwner.mutation(api.memes.deleteMeme, { memeId });

    const result = await t.action(
      internal.storageSweep.sweepOrphanedR2Objects,
      {},
    );

    expect(result.deleted).toBe(0);
    expect(await objectExists(t, key)).toBe(true);
    const meme = await getMeme(t, memeId);
    expect(meme?.status).toBe("deleted");
    expect(meme?.reclaimJobId).toBeDefined();
  });

  test("reclaims a deleted meme's object once its scheduled job is stalled well past the undo window", async () => {
    const key = "memes/stalled.png";
    const t = setup();
    const { userId, memeId } = await seedMeme(t, { mediaKey: key });
    await seedObject(t, key, new Date(Date.now() - 2 * 60 * 60 * 1000));
    const asOwner = t.withIdentity({ subject: `${userId}|session` });

    await asOwner.mutation(api.memes.deleteMeme, { memeId });
    // Simulate the scheduled reclaim job having failed to run: back-date
    // `deletedAt` well past DELETE_UNDO_WINDOW_MS + the sweep's stall margin,
    // while `reclaimJobId` stays set (as it would if the job never fired).
    await t.run(async (ctx) => {
      await ctx.db.patch(memeId, {
        deletedAt: Date.now() - DELETE_UNDO_WINDOW_MS - 2 * 60 * 60 * 1000,
      });
    });

    const result = await t.action(
      internal.storageSweep.sweepOrphanedR2Objects,
      {},
    );

    expect(result.deleted).toBe(1);
    expect(await objectExists(t, key)).toBe(false);
    const meme = await getMeme(t, memeId);
    expect(meme?.status).toBe("deleted");
    expect(meme?.reclaimJobId).toBeUndefined();
  });
});
