/// <reference types="vite/client" />
import actionRetrier from "@convex-dev/action-retrier/test";
import r2Test from "@convex-dev/r2/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const firstPage = { paginationOpts: { numItems: 10, cursor: null } };

// The `r2` client reads its bucket credentials from the deployment env at module
// construction. Set dummy values before any Convex function loads so the
// component's metadata query/delete can run without a real bucket; presigning is
// pure local crypto, so no network call is made.
process.env.R2_BUCKET = "test-bucket";
process.env.R2_ENDPOINT = "https://test.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";

/** Seed a user and a public/ready meme authored by them. */
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
      tags: ["funny"],
      authorId: userId,
      upvoteCount: 0,
      downvoteCount: 0,
      ...overrides,
    });
  });

  return { userId, memeId };
}

describe("listPublicMemes view-model", () => {
  const prev = process.env.R2_PUBLIC_URL;

  beforeEach(() => {
    process.env.R2_PUBLIC_URL = "https://media.example.com";
  });

  afterEach(() => {
    process.env.R2_PUBLIC_URL = prev;
  });

  test("resolves authorId to the live display name and mediaKey to a CDN URL", async () => {
    const t = convexTest(schema, modules);
    await seedMeme(t);

    const { page } = await t.query(api.memes.listPublicMemes, firstPage);

    expect(page).toHaveLength(1);
    expect(page[0].authorName).toBe("Tester");
    expect(page[0].mediaUrl).toBe("https://media.example.com/memes/abc.png");
  });

  test("author display name is resolved live, not denormalized", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedMeme(t);

    await t.run(async (ctx) => {
      await ctx.db.patch(userId, { name: "Renamed" });
    });

    const { page } = await t.query(api.memes.listPublicMemes, firstPage);
    expect(page[0].authorName).toBe("Renamed");
  });

  test("falls back to Anon when the author has no name", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {});
    });
    await seedMeme(t, { authorId: userId });

    const { page } = await t.query(api.memes.listPublicMemes, firstPage);
    expect(page).toHaveLength(1);
    expect(page[0].authorName).toBe("Anon");
  });

  test("never leaks raw foreign keys to the client", async () => {
    const t = convexTest(schema, modules);
    await seedMeme(t);

    const { page } = await t.query(api.memes.listPublicMemes, firstPage);
    expect(page[0]).not.toHaveProperty("authorId");
    expect(page[0]).not.toHaveProperty("mediaKey");
  });

  test("excludes memes that are not both public and ready", async () => {
    const t = convexTest(schema, modules);
    await seedMeme(t, { visibility: "private" });
    await seedMeme(t, { status: "processing" });
    await seedMeme(t, { status: "deleted" });
    await seedMeme(t); // the only public + ready meme

    const { page } = await t.query(api.memes.listPublicMemes, firstPage);
    expect(page).toHaveLength(1);
  });

  test("flags isOwner for the authoring viewer only", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seedMeme(t);
    const otherId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Someone else" }),
    );

    const asAuthor = t.withIdentity({ subject: `${userId}|session` });
    const asOther = t.withIdentity({ subject: `${otherId}|session` });

    expect(
      (await asAuthor.query(api.memes.listPublicMemes, firstPage)).page[0]
        .isOwner,
    ).toBe(true);
    expect(
      (await asOther.query(api.memes.listPublicMemes, firstPage)).page[0]
        .isOwner,
    ).toBe(false);
    // Guests are never owners.
    expect(
      (await t.query(api.memes.listPublicMemes, firstPage)).page[0].isOwner,
    ).toBe(false);
  });
});

describe("getMeme authorization matrix", () => {
  const prev = process.env.R2_PUBLIC_URL;

  beforeEach(() => {
    process.env.R2_PUBLIC_URL = "https://media.example.com";
  });

  afterEach(() => {
    process.env.R2_PUBLIC_URL = prev;
  });

  /** A second user, distinct from the meme's author. */
  function seedOtherUser(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Someone else" }),
    );
  }

  test("returns the FeedMeme view-model for a public + ready meme", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t);

    const meme = await t.query(api.memes.getMeme, { id: memeId });

    expect(meme).not.toBeNull();
    expect(meme?._id).toBe(memeId);
    expect(meme?.authorName).toBe("Tester");
    expect(meme?.mediaUrl).toBe("https://media.example.com/memes/abc.png");
    // Never leaks raw foreign keys to the client (ADR 0006).
    expect(meme).not.toHaveProperty("authorId");
    expect(meme).not.toHaveProperty("mediaKey");
    // No status in the view-model — it stays a read-time gate, not a field.
    expect(meme).not.toHaveProperty("status");
  });

  test("a guest sees a public + ready meme but isOwner is false", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t);

    const meme = await t.query(api.memes.getMeme, { id: memeId });
    expect(meme).not.toBeNull();
    expect(meme?.isOwner).toBe(false);
  });

  test("a guest cannot see a private meme", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t, { visibility: "private" });

    expect(await t.query(api.memes.getMeme, { id: memeId })).toBeNull();
  });

  test("a non-owner cannot see a private meme", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t, { visibility: "private" });
    const otherId = await seedOtherUser(t);
    const asOther = t.withIdentity({ subject: `${otherId}|session` });

    expect(await asOther.query(api.memes.getMeme, { id: memeId })).toBeNull();
  });

  test("a non-owner sees a public + ready meme without ownership", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t);
    const otherId = await seedOtherUser(t);
    const asOther = t.withIdentity({ subject: `${otherId}|session` });

    const meme = await asOther.query(api.memes.getMeme, { id: memeId });
    expect(meme).not.toBeNull();
    expect(meme?.isOwner).toBe(false);
  });

  test("the owner sees their own public + ready meme with isOwner true", async () => {
    const t = convexTest(schema, modules);
    const { userId, memeId } = await seedMeme(t);
    const asOwner = t.withIdentity({ subject: `${userId}|session` });

    const meme = await asOwner.query(api.memes.getMeme, { id: memeId });
    expect(meme).not.toBeNull();
    expect(meme?.isOwner).toBe(true);
  });

  test("the owner sees their own private + ready meme with isOwner true", async () => {
    const t = convexTest(schema, modules);
    const { userId, memeId } = await seedMeme(t, { visibility: "private" });
    const asOwner = t.withIdentity({ subject: `${userId}|session` });

    const meme = await asOwner.query(api.memes.getMeme, { id: memeId });
    expect(meme).not.toBeNull();
    expect(meme?.visibility).toBe("private");
    expect(meme?.isOwner).toBe(true);
  });

  test("a deleted meme is not found, even for its owner", async () => {
    const t = convexTest(schema, modules);
    const { userId, memeId } = await seedMeme(t, { status: "deleted" });
    const asOwner = t.withIdentity({ subject: `${userId}|session` });

    expect(await t.query(api.memes.getMeme, { id: memeId })).toBeNull();
    expect(await asOwner.query(api.memes.getMeme, { id: memeId })).toBeNull();
  });

  test("a non-ready (processing) meme is not found, even for its owner", async () => {
    const t = convexTest(schema, modules);
    const { userId, memeId } = await seedMeme(t, { status: "processing" });
    const asOwner = t.withIdentity({ subject: `${userId}|session` });

    expect(await t.query(api.memes.getMeme, { id: memeId })).toBeNull();
    expect(await asOwner.query(api.memes.getMeme, { id: memeId })).toBeNull();
  });

  test("a malformed id returns null instead of throwing", async () => {
    const t = convexTest(schema, modules);

    expect(await t.query(api.memes.getMeme, { id: "not-an-id" })).toBeNull();
  });

  test("a well-formed memes id with no document returns null", async () => {
    const t = convexTest(schema, modules);
    // A real memes id whose row we then delete: well-formed for the table, so it
    // survives `normalizeId`, but `ctx.db.get` finds nothing behind it.
    const { memeId } = await seedMeme(t);
    await t.run(async (ctx) => ctx.db.delete(memeId));

    expect(await t.query(api.memes.getMeme, { id: memeId })).toBeNull();
  });
});

const MB = 1024 * 1024;

describe("createMeme", () => {
  /**
   * Stand up a test instance with the R2 component mounted, seed a user, and
   * return a client scoped to that user (mirroring the `userId|sessionId`
   * subject shape `getAuthUserId` parses, as in `votes.test.ts`).
   */
  async function setup() {
    const t = convexTest(schema, modules);
    r2Test.register(t);
    // `r2Test.register` mounts the action-retrier at the top level, but the R2
    // component references it nested at `r2/actionRetrier`. Register it there so
    // `deleteObject` (which the retrier drives) works in the orphan-cleanup path.
    actionRetrier.register(t, "r2/actionRetrier");

    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { name: "Uploader" });
    });

    return {
      t,
      userId,
      asUser: t.withIdentity({ subject: `${userId}|session` }),
    };
  }

  /**
   * Seed the R2 component's metadata for `key` as if `syncMetadata` had run
   * after a real upload. `createMeme` reads content-type and size back from
   * here, so this is what drives server-authoritative validation.
   */
  function seedObject(
    t: ReturnType<typeof convexTest>,
    key: string,
    contentType: string,
    size: number,
  ) {
    return t.run(async (ctx) => {
      await ctx.runMutation(components.r2.lib.upsertMetadata, {
        key,
        bucket: "test-bucket",
        contentType,
        size,
        lastModified: new Date().toISOString(),
        link: `https://dash.example/objects/${key}/details`,
      });
    });
  }

  function getMeme(t: ReturnType<typeof convexTest>, memeId: Id<"memes">) {
    return t.run(async (ctx) => ctx.db.get(memeId));
  }

  function allMemes(t: ReturnType<typeof convexTest>) {
    return t.run(async (ctx) => ctx.db.query("memes").collect());
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

  /**
   * Drive the scheduled `processing → ready` flip to completion. The flip is a
   * single `runAfter(0)` hop, so yielding one macrotask lets the scheduler queue
   * it before `finishInProgressScheduledFunctions` waits it out.
   */
  async function drainLifecycle(t: ReturnType<typeof convexTest>) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await t.finishInProgressScheduledFunctions();
  }

  test("valid image upload ends ready, owned by caller, default public", async () => {
    const { t, userId, asUser } = await setup();
    await seedObject(t, "memes/cat.png", "image/png", 2 * MB);

    const memeId = await asUser.action(api.memes.createMeme, {
      key: "memes/cat.png",
      tags: [],
    });
    await drainLifecycle(t);

    const meme = await getMeme(t, memeId);
    expect(meme).not.toBeNull();
    expect(meme?.status).toBe("ready");
    expect(meme?.visibility).toBe("public");
    expect(meme?.mediaType).toBe("image");
    expect(meme?.authorId).toBe(userId);
    expect(meme?.mediaKey).toBe("memes/cat.png");
    expect(meme?.upvoteCount).toBe(0);
    expect(meme?.downvoteCount).toBe(0);
  });

  test("starts as processing before the lifecycle flip runs", async () => {
    const { t, asUser } = await setup();
    await seedObject(t, "memes/pending.png", "image/png", MB);

    const memeId = await asUser.action(api.memes.createMeme, {
      key: "memes/pending.png",
      tags: [],
    });

    // The flip is scheduled, not yet run.
    expect((await getMeme(t, memeId))?.status).toBe("processing");

    await drainLifecycle(t);
    expect((await getMeme(t, memeId))?.status).toBe("ready");
  });

  test("honors an explicit private visibility", async () => {
    const { t, asUser } = await setup();
    await seedObject(t, "memes/secret.png", "image/png", MB);

    const memeId = await asUser.action(api.memes.createMeme, {
      key: "memes/secret.png",
      tags: [],
      visibility: "private",
    });

    expect((await getMeme(t, memeId))?.visibility).toBe("private");
  });

  test("derives mediaType from the real content-type, not the client", async () => {
    const { t, asUser } = await setup();
    // A GIF must classify as `gif` (and use the 25 MB ceiling), not `image`.
    await seedObject(t, "memes/loop.gif", "image/gif", 20 * MB);

    const memeId = await asUser.action(api.memes.createMeme, {
      key: "memes/loop.gif",
      tags: [],
    });

    expect((await getMeme(t, memeId))?.mediaType).toBe("gif");
  });

  test("accepts a video within the 100 MB ceiling", async () => {
    const { t, asUser } = await setup();
    await seedObject(t, "memes/clip.mp4", "video/mp4", 80 * MB);

    const memeId = await asUser.action(api.memes.createMeme, {
      key: "memes/clip.mp4",
      tags: [],
    });

    expect((await getMeme(t, memeId))?.mediaType).toBe("video");
  });

  test("canonicalizes tags on write", async () => {
    const { t, asUser } = await setup();
    await seedObject(t, "memes/tagged.png", "image/png", MB);

    const memeId = await asUser.action(api.memes.createMeme, {
      key: "memes/tagged.png",
      tags: ["  Funny ", "funny", "Dank   Meme", "", "  "],
    });

    expect((await getMeme(t, memeId))?.tags).toEqual(["funny", "dank meme"]);
  });

  test("rejects an oversize upload, leaving no meme and no object", async () => {
    const { t, asUser } = await setup();
    await seedObject(t, "memes/huge.png", "image/png", 11 * MB);

    await expect(
      asUser.action(api.memes.createMeme, { key: "memes/huge.png", tags: [] }),
    ).rejects.toThrow();

    expect(await allMemes(t)).toHaveLength(0);
    expect(await objectExists(t, "memes/huge.png")).toBe(false);
  });

  test("rejects a GIF over its 25 MB ceiling (per-type thresholds)", async () => {
    const { t, asUser } = await setup();
    // 20 MB would pass as a GIF but fail if mis-classed as a 10 MB image; here
    // 26 MB must fail under the GIF ceiling specifically.
    await seedObject(t, "memes/big.gif", "image/gif", 26 * MB);

    await expect(
      asUser.action(api.memes.createMeme, { key: "memes/big.gif", tags: [] }),
    ).rejects.toThrow();

    expect(await allMemes(t)).toHaveLength(0);
    expect(await objectExists(t, "memes/big.gif")).toBe(false);
  });

  test("rejects an unsupported media type, leaving no meme and no object", async () => {
    const { t, asUser } = await setup();
    await seedObject(t, "memes/doc.pdf", "application/pdf", MB);

    await expect(
      asUser.action(api.memes.createMeme, { key: "memes/doc.pdf", tags: [] }),
    ).rejects.toThrow();

    expect(await allMemes(t)).toHaveLength(0);
    expect(await objectExists(t, "memes/doc.pdf")).toBe(false);
  });

  test("rejects when the object was never synced", async () => {
    const { t, asUser } = await setup();

    await expect(
      asUser.action(api.memes.createMeme, { key: "memes/ghost.png", tags: [] }),
    ).rejects.toThrow();

    expect(await allMemes(t)).toHaveLength(0);
  });

  test("rejects an unauthenticated caller, leaving no meme", async () => {
    const { t } = await setup();
    await seedObject(t, "memes/anon.png", "image/png", MB);

    await expect(
      t.action(api.memes.createMeme, { key: "memes/anon.png", tags: [] }),
    ).rejects.toThrow();

    expect(await allMemes(t)).toHaveLength(0);
    // Auth is checked before any cleanup, so a signed-out attempt must not
    // delete the object a legitimate retry would reuse.
    expect(await objectExists(t, "memes/anon.png")).toBe(true);
  });
});

describe("updateMeme", () => {
  function getMeme(t: ReturnType<typeof convexTest>, memeId: Id<"memes">) {
    return t.run(async (ctx) => ctx.db.get(memeId));
  }

  test("owner edits title, tags, and visibility; tags are canonicalized", async () => {
    const t = convexTest(schema, modules);
    const { userId, memeId } = await seedMeme(t, {
      title: "Old",
      tags: ["old"],
      visibility: "public",
    });
    const asOwner = t.withIdentity({ subject: `${userId}|session` });

    await asOwner.mutation(api.memes.updateMeme, {
      memeId,
      title: "New title",
      tags: ["  Dank   Meme ", "dank meme", ""],
      visibility: "private",
    });

    const meme = await getMeme(t, memeId);
    expect(meme?.title).toBe("New title");
    expect(meme?.tags).toEqual(["dank meme"]);
    expect(meme?.visibility).toBe("private");
  });

  test("a blank title clears the stored title", async () => {
    const t = convexTest(schema, modules);
    const { userId, memeId } = await seedMeme(t, { title: "Has a title" });
    const asOwner = t.withIdentity({ subject: `${userId}|session` });

    await asOwner.mutation(api.memes.updateMeme, {
      memeId,
      title: "   ",
      tags: [],
      visibility: "public",
    });

    expect((await getMeme(t, memeId))?.title).toBeUndefined();
  });

  test("rejects a non-owner and leaves the meme unchanged", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t, { title: "Mine" });
    const intruderId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Intruder" }),
    );
    const asIntruder = t.withIdentity({ subject: `${intruderId}|session` });

    await expect(
      asIntruder.mutation(api.memes.updateMeme, {
        memeId,
        title: "Hijacked",
        tags: [],
        visibility: "public",
      }),
    ).rejects.toThrow();

    expect((await getMeme(t, memeId))?.title).toBe("Mine");
  });

  test("rejects an unauthenticated caller", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t);

    await expect(
      t.mutation(api.memes.updateMeme, {
        memeId,
        tags: [],
        visibility: "public",
      }),
    ).rejects.toThrow();
  });

  test("rejects editing an already-deleted meme", async () => {
    const t = convexTest(schema, modules);
    const { userId, memeId } = await seedMeme(t, { status: "deleted" });
    const asOwner = t.withIdentity({ subject: `${userId}|session` });

    await expect(
      asOwner.mutation(api.memes.updateMeme, {
        memeId,
        tags: [],
        visibility: "public",
      }),
    ).rejects.toThrow();
  });
});

describe("deleteMeme", () => {
  /**
   * Stand up an instance with the R2 component mounted (and the action-retrier
   * registered where the component expects it, as in `createMeme`), seed a user
   * and a ready meme, plus the R2 object the meme points at so `deleteObject`
   * has something to reclaim.
   */
  async function setup(key = "memes/del.png") {
    const t = convexTest(schema, modules);
    r2Test.register(t);
    actionRetrier.register(t, "r2/actionRetrier");

    const { userId, memeId } = await seedMeme(t, { mediaKey: key });
    await t.run(async (ctx) => {
      await ctx.runMutation(components.r2.lib.upsertMetadata, {
        key,
        bucket: "test-bucket",
        contentType: "image/png",
        size: MB,
        lastModified: new Date().toISOString(),
        link: `https://dash.example/objects/${key}/details`,
      });
    });

    return {
      t,
      userId,
      memeId,
      key,
      asOwner: t.withIdentity({ subject: `${userId}|session` }),
    };
  }

  function getMeme(t: ReturnType<typeof convexTest>, memeId: Id<"memes">) {
    return t.run(async (ctx) => ctx.db.get(memeId));
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

  test("owner delete tombstones the meme, reclaims the object, keeps votes", async () => {
    const { t, userId, memeId, key, asOwner } = await setup();
    // A vote that must survive the delete (tombstone leaves rows in place).
    await t.run(async (ctx) => {
      await ctx.db.insert("votes", { userId, memeId, value: "up" });
    });

    await asOwner.action(api.memes.deleteMeme, { memeId });

    expect((await getMeme(t, memeId))?.status).toBe("deleted");
    expect(await objectExists(t, key)).toBe(false);
    const votes = await t.run(async (ctx) =>
      ctx.db
        .query("votes")
        .withIndex("by_meme", (q) => q.eq("memeId", memeId))
        .collect(),
    );
    expect(votes).toHaveLength(1);
  });

  test("rejects a non-owner, leaving the meme and object intact", async () => {
    const { t, memeId, key } = await setup();
    const intruderId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Intruder" }),
    );
    const asIntruder = t.withIdentity({ subject: `${intruderId}|session` });

    await expect(
      asIntruder.action(api.memes.deleteMeme, { memeId }),
    ).rejects.toThrow();

    expect((await getMeme(t, memeId))?.status).toBe("ready");
    expect(await objectExists(t, key)).toBe(true);
  });

  test("rejects an unauthenticated caller, leaving the meme and object intact", async () => {
    const { t, memeId, key } = await setup();

    await expect(t.action(api.memes.deleteMeme, { memeId })).rejects.toThrow();

    expect((await getMeme(t, memeId))?.status).toBe("ready");
    expect(await objectExists(t, key)).toBe(true);
  });
});
