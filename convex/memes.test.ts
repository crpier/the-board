/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const firstPage = { paginationOpts: { numItems: 10, cursor: null } };

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
    // Two memes seeded (default Tester + this one); the nameless author's is one.
    expect(page.map((m) => m.authorName)).toContain("Anon");
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
    await seedMeme(t); // the only public + ready meme

    const { page } = await t.query(api.memes.listPublicMemes, firstPage);
    expect(page).toHaveLength(1);
  });
});
