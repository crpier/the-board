/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MAX_DISPLAY_NAME_LENGTH } from "./profile";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const firstPage = { paginationOpts: { numItems: 10, cursor: null } };

// Feed/detail assertions below resolve `mediaKey` through `resolveUrl`, which
// needs the CDN base; the R2 client itself reads bucket credentials from the
// env at module construction (see memes.test.ts).
process.env.R2_BUCKET = "test-bucket";
process.env.R2_ENDPOINT = "https://test.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
process.env.R2_PUBLIC_URL = "https://media.example.com";

/**
 * Seed a user and return a client scoped to them. `getAuthUserId` parses the
 * user id out of the identity `subject` (`userId|sessionId`), so we mirror
 * that shape (see votes.test.ts).
 */
async function setup(user: Record<string, unknown> = { name: "Tester" }) {
  const t = convexTest(schema, modules);

  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", user);
  });

  const asUser = t.withIdentity({ subject: `${userId}|session` });

  return { t, userId, asUser };
}

/** Seed a public/ready meme authored by the given user. */
async function seedMeme(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("memes", {
      visibility: "public",
      status: "ready",
      mediaKey: "memes/abc.png",
      mediaType: "image",
      tags: [],
      authorId: userId,
      upvoteCount: 0,
      downvoteCount: 0,
    });
  });
}

describe("updateDisplayName", () => {
  test("rejects unauthenticated callers", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.viewer.updateDisplayName, { displayName: "Nope" }),
    ).rejects.toThrow("You must be signed in to edit your profile.");
  });

  test("rename updates viewer.current.displayName", async () => {
    const { asUser } = await setup();

    await asUser.mutation(api.viewer.updateDisplayName, {
      displayName: "MemeQueen",
    });

    const viewer = await asUser.query(api.viewer.current, {});
    expect(viewer?.displayName).toBe("MemeQueen");
  });

  test("rename is reflected live in feed and detail attribution", async () => {
    const { t, userId, asUser } = await setup();
    const memeId = await seedMeme(t, userId);

    await asUser.mutation(api.viewer.updateDisplayName, {
      displayName: "MemeQueen",
    });

    // No backfill ran — the name is resolved live at read time (ADR 0006).
    const { page } = await t.query(api.memes.listPublicMemes, firstPage);
    expect(page[0].authorName).toBe("MemeQueen");

    const detail = await t.query(api.memes.getMeme, { id: memeId });
    expect(detail?.authorName).toBe("MemeQueen");
  });

  test("blank input clears the override, falling back to the provider name", async () => {
    const { t, userId, asUser } = await setup();

    await asUser.mutation(api.viewer.updateDisplayName, {
      displayName: "MemeQueen",
    });
    await asUser.mutation(api.viewer.updateDisplayName, {
      displayName: "   ",
    });

    const viewer = await asUser.query(api.viewer.current, {});
    expect(viewer?.displayName).toBe("Tester");

    // The field is removed, not stored as an empty string.
    const user = await t.run(async (ctx) => ctx.db.get(userId));
    expect(user?.displayName).toBeUndefined();
  });

  test("blank input with no provider name falls back to Anon", async () => {
    const { asUser } = await setup({});

    await asUser.mutation(api.viewer.updateDisplayName, { displayName: "" });

    const viewer = await asUser.query(api.viewer.current, {});
    expect(viewer?.displayName).toBe("Anon");
  });

  test("rejects names over the cap and accepts exactly the cap", async () => {
    const { asUser } = await setup();

    await expect(
      asUser.mutation(api.viewer.updateDisplayName, {
        displayName: "x".repeat(MAX_DISPLAY_NAME_LENGTH + 1),
      }),
    ).rejects.toThrow(
      `Display name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
    );

    const exact = "x".repeat(MAX_DISPLAY_NAME_LENGTH);
    await asUser.mutation(api.viewer.updateDisplayName, { displayName: exact });
    const viewer = await asUser.query(api.viewer.current, {});
    expect(viewer?.displayName).toBe(exact);
  });

  test("trims before the cap check and before storing", async () => {
    const { asUser } = await setup();

    // Padded past the cap, but the trimmed name is exactly at it.
    const padded = `  ${"x".repeat(MAX_DISPLAY_NAME_LENGTH)}  `;
    await asUser.mutation(api.viewer.updateDisplayName, {
      displayName: padded,
    });

    const viewer = await asUser.query(api.viewer.current, {});
    expect(viewer?.displayName).toBe("x".repeat(MAX_DISPLAY_NAME_LENGTH));
  });
});
