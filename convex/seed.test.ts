/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";
import { SEED_MEMES } from "./seedAssets";

const modules = import.meta.glob("./**/*.ts");

// `seed` itself uploads to R2 (`r2.store`), which needs a real bucket, so — per
// the same convention as `r2.test.ts` — the full upload → publish round trip is
// covered by the PR's manual acceptance check, not here. These tests exercise
// the bucket-free pieces: owner resolution and the bundled asset set's shape.

describe("ensureSeedUser", () => {
  test("returns the first (auto-admin) user when one already exists", async () => {
    const t = convexTest(schema, modules);
    const firstId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { name: "First", isAdmin: true });
      await ctx.db.insert("users", { name: "Second" });
      return id;
    });

    const resolved = await t.mutation(internal.seed.ensureSeedUser, {});
    expect(resolved).toBe(firstId);
  });

  test("mints a stand-in admin when there are no users", async () => {
    const t = convexTest(schema, modules);
    const resolved = await t.mutation(internal.seed.ensureSeedUser, {});

    const user = await t.run((ctx) => ctx.db.get(resolved));
    expect(user?.isAdmin).toBe(true);
  });
});

describe("SEED_MEMES asset set", () => {
  test("covers every media type so the feed renderers are all exercised", () => {
    const types = new Set(SEED_MEMES.map((m) => m.sample.mediaType));
    expect(types).toEqual(new Set(["image", "gif", "video"]));
  });

  test("includes a private meme so the public-feed visibility filter is exercised", () => {
    expect(SEED_MEMES.some((m) => m.visibility === "private")).toBe(true);
    expect(SEED_MEMES.some((m) => m.visibility === "public")).toBe(true);
  });

  test("tags are already canonical (lowercase, trimmed, non-empty)", () => {
    for (const meme of SEED_MEMES) {
      for (const tag of meme.tags) {
        expect(tag).toBe(tag.trim().toLowerCase());
        expect(tag.length).toBeGreaterThan(0);
      }
    }
  });
});
