/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Seed a user and a public/ready meme, and return a client scoped to that user.
 *
 * `@convex-dev/auth`'s `getAuthUserId` parses the user id out of the identity
 * `subject` (formatted as `userId|sessionId`), so we mirror that shape here.
 */
async function setup(memeOverrides: Record<string, unknown> = {}) {
  const t = convexTest(schema, modules);

  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { name: "Tester" });
  });

  const memeId = await t.run(async (ctx) => {
    return await ctx.db.insert("memes", {
      visibility: "public",
      status: "ready",
      mediaUrl: "https://example.com/meme.png",
      mediaType: "image",
      tags: [],
      authorName: "Tester",
      upvoteCount: 0,
      downvoteCount: 0,
      ...memeOverrides,
    });
  });

  const asUser = t.withIdentity({ subject: `${userId}|session` });

  return { t, userId, memeId, asUser };
}

function readMeme(t: ReturnType<typeof convexTest>, memeId: Id<"memes">) {
  return t.run(async (ctx) => {
    const meme = await ctx.db.get(memeId);
    if (meme === null) throw new Error("meme vanished");
    return meme;
  });
}

function countVotes(t: ReturnType<typeof convexTest>, memeId: Id<"memes">) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.query("votes").collect();
    return rows.filter((r) => r.memeId === memeId);
  });
}

describe("castVote", () => {
  test("none -> up creates a row and bumps upvoteCount", async () => {
    const { t, memeId, asUser } = await setup();

    await asUser.mutation(api.votes.castVote, { memeId, value: "up" });

    const meme = await readMeme(t, memeId);
    expect(meme.upvoteCount).toBe(1);
    expect(meme.downvoteCount).toBe(0);

    const votes = await countVotes(t, memeId);
    expect(votes).toHaveLength(1);
    expect(votes[0].value).toBe("up");
  });

  test("none -> down creates a row and bumps downvoteCount", async () => {
    const { t, memeId, asUser } = await setup();

    await asUser.mutation(api.votes.castVote, { memeId, value: "down" });

    const meme = await readMeme(t, memeId);
    expect(meme.upvoteCount).toBe(0);
    expect(meme.downvoteCount).toBe(1);

    const votes = await countVotes(t, memeId);
    expect(votes).toHaveLength(1);
    expect(votes[0].value).toBe("down");
  });

  test("up -> up clears the vote", async () => {
    const { t, memeId, asUser } = await setup();

    await asUser.mutation(api.votes.castVote, { memeId, value: "up" });
    await asUser.mutation(api.votes.castVote, { memeId, value: "up" });

    const meme = await readMeme(t, memeId);
    expect(meme.upvoteCount).toBe(0);
    expect(meme.downvoteCount).toBe(0);
    expect(await countVotes(t, memeId)).toHaveLength(0);
  });

  test("down -> down clears the vote", async () => {
    const { t, memeId, asUser } = await setup();

    await asUser.mutation(api.votes.castVote, { memeId, value: "down" });
    await asUser.mutation(api.votes.castVote, { memeId, value: "down" });

    const meme = await readMeme(t, memeId);
    expect(meme.upvoteCount).toBe(0);
    expect(meme.downvoteCount).toBe(0);
    expect(await countVotes(t, memeId)).toHaveLength(0);
  });

  test("up -> down flips both counters", async () => {
    const { t, memeId, asUser } = await setup();

    await asUser.mutation(api.votes.castVote, { memeId, value: "up" });
    await asUser.mutation(api.votes.castVote, { memeId, value: "down" });

    const meme = await readMeme(t, memeId);
    expect(meme.upvoteCount).toBe(0);
    expect(meme.downvoteCount).toBe(1);

    const votes = await countVotes(t, memeId);
    expect(votes).toHaveLength(1);
    expect(votes[0].value).toBe("down");
  });

  test("down -> up flips both counters", async () => {
    const { t, memeId, asUser } = await setup();

    await asUser.mutation(api.votes.castVote, { memeId, value: "down" });
    await asUser.mutation(api.votes.castVote, { memeId, value: "up" });

    const meme = await readMeme(t, memeId);
    expect(meme.upvoteCount).toBe(1);
    expect(meme.downvoteCount).toBe(0);

    const votes = await countVotes(t, memeId);
    expect(votes).toHaveLength(1);
    expect(votes[0].value).toBe("up");
  });

  test("signed-out users are rejected", async () => {
    const { t, memeId } = await setup();

    await expect(
      t.mutation(api.votes.castVote, { memeId, value: "up" }),
    ).rejects.toThrow();

    expect(await countVotes(t, memeId)).toHaveLength(0);
  });

  test("voting on a non-existent meme is rejected", async () => {
    const { t, memeId, asUser } = await setup();

    // Delete the meme so its id is valid-shaped but resolves to nothing.
    await t.run(async (ctx) => {
      await ctx.db.delete(memeId);
    });

    await expect(
      asUser.mutation(api.votes.castVote, { memeId, value: "up" }),
    ).rejects.toThrow();
  });

  test("voting on a non-public meme is rejected", async () => {
    const { memeId, asUser } = await setup({ visibility: "private" });

    await expect(
      asUser.mutation(api.votes.castVote, { memeId, value: "up" }),
    ).rejects.toThrow();
  });

  test("voting on a non-ready meme is rejected", async () => {
    const { memeId, asUser } = await setup({ status: "processing" });

    await expect(
      asUser.mutation(api.votes.castVote, { memeId, value: "up" }),
    ).rejects.toThrow();
  });

  test("a user may vote on their own meme", async () => {
    const { t, userId, memeId, asUser } = await setup();

    // Make the voter the author of the meme.
    await t.run(async (ctx) => {
      await ctx.db.patch(memeId, { authorName: "Tester" });
    });
    expect(userId).toBeDefined();

    await asUser.mutation(api.votes.castVote, { memeId, value: "up" });

    const meme = await readMeme(t, memeId);
    expect(meme.upvoteCount).toBe(1);
    expect(await countVotes(t, memeId)).toHaveLength(1);
  });

  test("counters never go negative and stay equal to row counts", async () => {
    const { t, memeId, asUser } = await setup();

    // Drift the stored count below what votes justify, then clear a vote.
    await asUser.mutation(api.votes.castVote, { memeId, value: "up" });
    await t.run(async (ctx) => {
      await ctx.db.patch(memeId, { upvoteCount: 0 });
    });

    // up -> up clears the single row; counter is clamped at 0 rather than -1.
    await asUser.mutation(api.votes.castVote, { memeId, value: "up" });

    const meme = await readMeme(t, memeId);
    expect(meme.upvoteCount).toBe(0);
    expect(meme.downvoteCount).toBe(0);

    const votes = await countVotes(t, memeId);
    expect(votes).toHaveLength(0);
    expect(meme.upvoteCount + meme.downvoteCount).toBe(votes.length);
  });

  test("aggregate counts equal the number of vote rows across users", async () => {
    const { t, memeId, asUser } = await setup();

    // Second user, voting down on the same meme.
    const otherUserId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", { name: "Other" });
    });
    const asOther = t.withIdentity({ subject: `${otherUserId}|session` });

    await asUser.mutation(api.votes.castVote, { memeId, value: "up" });
    await asOther.mutation(api.votes.castVote, { memeId, value: "down" });

    const meme = await readMeme(t, memeId);
    const votes = await countVotes(t, memeId);
    expect(meme.upvoteCount).toBe(1);
    expect(meme.downvoteCount).toBe(1);
    expect(meme.upvoteCount + meme.downvoteCount).toBe(votes.length);
  });
});
