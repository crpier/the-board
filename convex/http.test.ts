/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// `r2.ts` reads its bucket credentials from the deployment env at module
// construction (see `memes.test.ts`); set dummy values so any module that
// imports it (transitively, via `http.ts` -> `memes.ts` -> `r2.ts`) can load.
process.env.R2_BUCKET = "test-bucket";
process.env.R2_ENDPOINT = "https://test.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";

/** Seed a user and a meme, defaulting to public + ready. */
async function seedMeme(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
) {
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { name: "Tester" });
  });

  const memeId = await t.run(async (ctx) => {
    return await ctx.db.insert("memes", {
      title: "Secret Sauce",
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

describe("GET /meme/:id (og unfurl shell)", () => {
  const prevR2 = process.env.R2_PUBLIC_URL;
  const prevApp = process.env.APP_URL;

  beforeEach(() => {
    process.env.R2_PUBLIC_URL = "https://media.example.com";
    process.env.APP_URL = "https://app.example.com";
  });

  afterEach(() => {
    process.env.R2_PUBLIC_URL = prevR2;
    process.env.APP_URL = prevApp;
  });

  test("public, ready meme unfurls with its real title and image", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t);

    const res = await t.fetch(`/meme/${memeId}`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('property="og:title" content="Secret Sauce');
    expect(html).toContain(
      'property="og:image" content="https://media.example.com/memes/abc.png"',
    );
    expect(html).toContain(
      `property="og:url" content="https://app.example.com/meme/${memeId}"`,
    );
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });

  test("private meme unfurls with a generic fallback, not its real title/image", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t, { visibility: "private" });

    const res = await t.fetch(`/meme/${memeId}`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).not.toContain("Secret Sauce");
    expect(html).not.toContain("media.example.com");
    expect(html).toContain('property="og:title" content="The Board"');
  });

  test("admin-hidden meme (moderateMeme -> private) unfurls with the generic fallback", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t);

    // Same visibility flip `moderateMeme` performs when an admin hides a meme
    // (#56); the http action must treat it identically to any other private
    // meme, with no admin-viewer special case.
    await t.run(async (ctx) => {
      await ctx.db.patch(memeId, { visibility: "private" });
    });

    const res = await t.fetch(`/meme/${memeId}`);
    const html = await res.text();
    expect(html).not.toContain("Secret Sauce");
  });

  test("not-yet-ready meme unfurls with the generic fallback", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t, { status: "processing" });

    const res = await t.fetch(`/meme/${memeId}`);
    const html = await res.text();
    expect(html).not.toContain("Secret Sauce");
  });

  test("deleted meme unfurls with the generic fallback", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t, { status: "deleted" });

    const res = await t.fetch(`/meme/${memeId}`);
    const html = await res.text();
    expect(html).not.toContain("Secret Sauce");
  });

  test("unknown/malformed id unfurls with the generic fallback, not a crash", async () => {
    const t = convexTest(schema, modules);

    const res = await t.fetch(`/meme/not-a-real-id`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('property="og:title" content="The Board"');
  });

  test("video memes unfurl with title/description but no og:image", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t, {
      mediaType: "video",
      mediaKey: "memes/clip.mp4",
    });

    const res = await t.fetch(`/meme/${memeId}`);
    const html = await res.text();

    expect(html).toContain('property="og:title" content="Secret Sauce');
    expect(html).not.toContain("og:image");
    expect(html).toContain('name="twitter:card" content="summary"');
  });

  test("redirects the browser to the real app route", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t);

    const res = await t.fetch(`/meme/${memeId}`);
    const html = await res.text();

    const appUrl = `https://app.example.com/meme/${memeId}`;
    expect(html).toContain(`content="0; url=${appUrl}"`);
    expect(html).toContain(`location.replace("${appUrl}")`);
  });

  test("escapes a title containing HTML-sensitive characters", async () => {
    const t = convexTest(schema, modules);
    const { memeId } = await seedMeme(t, {
      title: `<script>alert("hi")</script>`,
    });

    const res = await t.fetch(`/meme/${memeId}`);
    const html = await res.text();

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
