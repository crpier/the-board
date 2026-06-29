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

  test("vote tallies are varied so aggregates are exercised end to end", () => {
    const tallies = SEED_MEMES.flatMap((m) => (m.votes ? [m.votes] : []));
    // Non-zero counts, a downvote-heavy meme, and a public meme with no votes.
    expect(tallies.some((v) => v.up > 0)).toBe(true);
    expect(tallies.some((v) => v.down > v.up)).toBe(true);
    expect(
      SEED_MEMES.some(
        (m) => m.visibility === "public" && m.votes === undefined,
      ),
    ).toBe(true);
    for (const v of tallies) {
      expect(Number.isInteger(v.up) && v.up >= 0).toBe(true);
      expect(Number.isInteger(v.down) && v.down >= 0).toBe(true);
    }
  });
});

describe("ensureSeedVoters", () => {
  test("mints the requested number of non-admin users", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.mutation(internal.seed.ensureSeedVoters, { count: 3 });
    expect(ids).toHaveLength(3);

    const users = await t.run((ctx) =>
      Promise.all(ids.map((id) => ctx.db.get(id))),
    );
    for (const user of users) {
      expect(user?.isAdmin).toBeFalsy();
    }
  });
});

describe("seedVotes", () => {
  test("inserts one row per voter and sets counts to match", async () => {
    const t = convexTest(schema, modules);
    const { memeId, voterIds } = await t.run(async (ctx) => {
      const authorId = await ctx.db.insert("users", { name: "Author" });
      const memeId = await ctx.db.insert("memes", {
        title: "votable",
        visibility: "public",
        status: "ready",
        mediaKey: "k",
        mediaType: "image",
        tags: [],
        authorId,
        upvoteCount: 0,
        downvoteCount: 0,
      });
      const voterIds = [];
      for (let i = 0; i < 3; i++) {
        voterIds.push(await ctx.db.insert("users", { name: `V${i}` }));
      }
      return { memeId, voterIds };
    });

    await t.mutation(internal.seed.seedVotes, {
      memeId,
      voterIds,
      up: 2,
      down: 1,
    });

    const { meme, rows } = await t.run(async (ctx) => ({
      meme: await ctx.db.get(memeId),
      rows: await ctx.db
        .query("votes")
        .withIndex("by_meme", (q) => q.eq("memeId", memeId))
        .collect(),
    }));

    expect(meme?.upvoteCount).toBe(2);
    expect(meme?.downvoteCount).toBe(1);
    // Counts equal the vote-row totals (ADR 0004 invariant).
    expect(rows.filter((r) => r.value === "up")).toHaveLength(2);
    expect(rows.filter((r) => r.value === "down")).toHaveLength(1);
  });
});
