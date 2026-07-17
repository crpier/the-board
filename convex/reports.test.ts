/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * Seed an author, a public/ready meme, and a separate reporter, mirroring
 * `votes.test.ts`'s `setup`. `getAuthUserId` parses the user id out of the
 * identity `subject` (formatted as `userId|sessionId`), hence the shape here.
 */
async function setup(memeOverrides: Record<string, unknown> = {}) {
  const t = convexTest(schema, modules);

  const authorId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { name: "Author" });
  });

  const memeId = await t.run(async (ctx) => {
    return await ctx.db.insert("memes", {
      visibility: "public",
      status: "ready",
      mediaKey: "memes/test.png",
      mediaType: "image",
      tags: [],
      authorId,
      upvoteCount: 0,
      downvoteCount: 0,
      ...memeOverrides,
    });
  });

  const reporterId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { name: "Reporter" });
  });
  const asReporter = t.withIdentity({ subject: `${reporterId}|session` });

  const adminId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", { name: "Admin", isAdmin: true });
  });
  const asAdmin = t.withIdentity({ subject: `${adminId}|session` });

  return { t, authorId, memeId, reporterId, asReporter, adminId, asAdmin };
}

function readMeme(t: ReturnType<typeof convexTest>, memeId: Id<"memes">) {
  return t.run(async (ctx) => {
    const meme = await ctx.db.get(memeId);
    if (meme === null) throw new Error("meme vanished");
    return meme;
  });
}

function readReport(t: ReturnType<typeof convexTest>, reportId: Id<"reports">) {
  return t.run(async (ctx) => {
    const report = await ctx.db.get(reportId);
    if (report === null) throw new Error("report vanished");
    return report;
  });
}

describe("createReport", () => {
  test("a signed-in user can report a meme with a reason", async () => {
    const { t, memeId, reporterId, asReporter } = await setup();

    await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });

    const reports = await t.run(async (ctx) =>
      ctx.db.query("reports").collect(),
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      memeId,
      reporterId,
      reason: "spam",
      status: "open",
    });
    // Convex omits undefined optional fields from the stored doc entirely
    // rather than storing an explicit `undefined`, so these are asserted
    // separately from `toMatchObject` above.
    expect(reports[0].details).toBeUndefined();
    expect(reports[0].resolvedBy).toBeUndefined();
  });

  test("optional details are trimmed and stored", async () => {
    const { t, memeId, asReporter } = await setup();

    await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "other",
      details: "  looks like a duplicate of another post  ",
    });

    const reports = await t.run(async (ctx) =>
      ctx.db.query("reports").collect(),
    );
    expect(reports[0].details).toBe("looks like a duplicate of another post");
  });

  test("blank details are stored as undefined, not an empty string", async () => {
    const { t, memeId, asReporter } = await setup();

    await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "other",
      details: "   ",
    });

    const reports = await t.run(async (ctx) =>
      ctx.db.query("reports").collect(),
    );
    expect(reports[0].details).toBeUndefined();
  });

  test("signed-out users are rejected", async () => {
    const { t, memeId } = await setup();

    await expect(
      t.mutation(api.reports.createReport, { memeId, reason: "spam" }),
    ).rejects.toThrow();

    expect(
      await t.run(async (ctx) => ctx.db.query("reports").collect()),
    ).toHaveLength(0);
  });

  test("a second open report on the same meme by the same user is rejected", async () => {
    const { t, memeId, asReporter } = await setup();

    await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });

    await expect(
      asReporter.mutation(api.reports.createReport, {
        memeId,
        reason: "harassment",
      }),
    ).rejects.toThrow();

    expect(
      await t.run(async (ctx) => ctx.db.query("reports").collect()),
    ).toHaveLength(1);
  });

  test("a user can re-report a meme once their prior report was resolved", async () => {
    const { t, memeId, asReporter, asAdmin } = await setup();

    const firstReportId = await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });
    await asAdmin.mutation(api.reports.resolveReport, {
      reportId: firstReportId,
      resolution: "dismiss",
    });

    // Should not throw: the prior report is no longer open.
    await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "other",
    });

    expect(
      await t.run(async (ctx) => ctx.db.query("reports").collect()),
    ).toHaveLength(2);
  });

  test("reporting a non-existent meme is rejected", async () => {
    const { t, memeId, asReporter } = await setup();

    await t.run(async (ctx) => {
      await ctx.db.delete(memeId);
    });

    await expect(
      asReporter.mutation(api.reports.createReport, { memeId, reason: "spam" }),
    ).rejects.toThrow("Meme not found.");
  });

  // These three cases must be indistinguishable to the caller — a guessed or
  // stale meme id must not let a signed-in user learn whether the meme
  // exists, is private, or was hidden by an admin (opaque-not-found
  // convention, mirrors `castVote`'s guard).
  test("reporting a private meme throws the same opaque error as a missing meme", async () => {
    const { memeId, asReporter } = await setup({ visibility: "private" });

    await expect(
      asReporter.mutation(api.reports.createReport, { memeId, reason: "spam" }),
    ).rejects.toThrow("Meme not found.");
  });

  test("reporting an admin-hidden meme is rejected with the opaque not-found error", async () => {
    const { t, memeId, asReporter, asAdmin } = await setup();
    await asAdmin.mutation(api.reports.resolveReport, {
      reportId: await asReporter.mutation(api.reports.createReport, {
        memeId,
        reason: "spam",
      }),
      resolution: "hide",
    });

    const meme = await readMeme(t, memeId);
    expect(meme.visibility).toBe("private");

    const otherReporterId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Other reporter" }),
    );
    const asOtherReporter = t.withIdentity({
      subject: `${otherReporterId}|session`,
    });

    await expect(
      asOtherReporter.mutation(api.reports.createReport, {
        memeId,
        reason: "spam",
      }),
    ).rejects.toThrow("Meme not found.");
  });

  test("reporting a public+ready meme succeeds", async () => {
    const { t, memeId, asReporter } = await setup();

    await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });

    expect(
      await t.run(async (ctx) => ctx.db.query("reports").collect()),
    ).toHaveLength(1);
  });
});

describe("myReportStatus", () => {
  test('guests get "none"', async () => {
    const { t, memeId } = await setup();

    expect(await t.query(api.reports.myReportStatus, { memeId })).toBe("none");
  });

  test('a viewer with no report gets "none"', async () => {
    const { memeId, asReporter } = await setup();

    expect(await asReporter.query(api.reports.myReportStatus, { memeId })).toBe(
      "none",
    );
  });

  test('a viewer with an open report gets "open"', async () => {
    const { memeId, asReporter } = await setup();

    await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });

    expect(await asReporter.query(api.reports.myReportStatus, { memeId })).toBe(
      "open",
    );
  });

  test("does not leak another user's report", async () => {
    const { t, memeId, asReporter } = await setup();

    await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });

    const otherId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "Other" }),
    );
    const asOther = t.withIdentity({ subject: `${otherId}|session` });

    expect(await asOther.query(api.reports.myReportStatus, { memeId })).toBe(
      "none",
    );
  });
});

describe("listOpenReports", () => {
  // Only the "meme still available" path resolves a CDN url (`memeAvailable`
  // gates the `resolveUrl` call in the handler), but stub it for the whole
  // group to match `memes.test.ts`'s convention.
  const prev = process.env.R2_PUBLIC_URL;

  beforeEach(() => {
    process.env.R2_PUBLIC_URL = "https://media.example.com";
  });

  afterEach(() => {
    process.env.R2_PUBLIC_URL = prev;
  });

  test("a non-admin (including guests) is rejected", async () => {
    const { t, memeId, asReporter } = await setup();
    await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });

    await expect(
      t.query(api.reports.listOpenReports, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow();

    await expect(
      asReporter.query(api.reports.listOpenReports, {
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow();
  });

  test("an admin sees open reports with resolved meme/reporter context", async () => {
    const { memeId, reporterId, asReporter, asAdmin } = await setup({
      title: "Cursed cat",
    });
    await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "hate_speech",
      details: "not okay",
    });

    const result = await asAdmin.query(api.reports.listOpenReports, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0]).toMatchObject({
      memeId,
      reason: "hate_speech",
      details: "not okay",
      reporterName: "Reporter",
      memeAvailable: true,
      memeTitle: "Cursed cat",
    });
    expect(reporterId).toBeDefined();
  });

  test("resolved/dismissed reports do not appear in the queue", async () => {
    const { memeId, asReporter, asAdmin } = await setup();
    const reportId = await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });
    await asAdmin.mutation(api.reports.resolveReport, {
      reportId,
      resolution: "dismiss",
    });

    const result = await asAdmin.query(api.reports.listOpenReports, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(result.page).toHaveLength(0);
  });

  test("a report on an already-deleted meme still appears, flagged unavailable", async () => {
    const { t, memeId, asReporter, asAdmin } = await setup();
    await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(memeId, { status: "deleted" });
    });

    const result = await asAdmin.query(api.reports.listOpenReports, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(result.page).toHaveLength(1);
    expect(result.page[0].memeAvailable).toBe(false);
    expect(result.page[0].memeMediaUrl).toBeUndefined();
  });
});

describe("resolveReport", () => {
  test("hide flips the report to resolved and the meme to private", async () => {
    const { t, memeId, asReporter, asAdmin, adminId } = await setup();
    const reportId = await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });

    await asAdmin.mutation(api.reports.resolveReport, {
      reportId,
      resolution: "hide",
    });

    const report = await readReport(t, reportId);
    expect(report.status).toBe("resolved");
    expect(report.resolvedBy).toBe(adminId);

    const meme = await readMeme(t, memeId);
    expect(meme.visibility).toBe("private");
  });

  test("dismiss flips the report to dismissed and leaves the meme untouched", async () => {
    const { t, memeId, asReporter, asAdmin, adminId } = await setup();
    const reportId = await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });

    await asAdmin.mutation(api.reports.resolveReport, {
      reportId,
      resolution: "dismiss",
    });

    const report = await readReport(t, reportId);
    expect(report.status).toBe("dismissed");
    expect(report.resolvedBy).toBe(adminId);

    const meme = await readMeme(t, memeId);
    expect(meme.visibility).toBe("public");
  });

  test("a non-admin cannot resolve a report", async () => {
    const { memeId, asReporter } = await setup();
    const reportId = await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });

    await expect(
      asReporter.mutation(api.reports.resolveReport, {
        reportId,
        resolution: "dismiss",
      }),
    ).rejects.toThrow();
  });

  test("resolving an already-resolved report is a no-op, not an error", async () => {
    const { t, memeId, asReporter, asAdmin } = await setup();
    const reportId = await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });

    await asAdmin.mutation(api.reports.resolveReport, {
      reportId,
      resolution: "dismiss",
    });
    // A second resolve (e.g. a doubled click, or a race between two admins)
    // must not throw or flip a dismissed report to resolved.
    await asAdmin.mutation(api.reports.resolveReport, {
      reportId,
      resolution: "hide",
    });

    const report = await readReport(t, reportId);
    expect(report.status).toBe("dismissed");
    const meme = await readMeme(t, memeId);
    expect(meme.visibility).toBe("public");
  });

  test("hiding a report whose meme is already deleted does not throw", async () => {
    const { t, memeId, asReporter, asAdmin } = await setup();
    const reportId = await asReporter.mutation(api.reports.createReport, {
      memeId,
      reason: "spam",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(memeId, { status: "deleted" });
    });

    await asAdmin.mutation(api.reports.resolveReport, {
      reportId,
      resolution: "hide",
    });

    const report = await readReport(t, reportId);
    expect(report.status).toBe("resolved");
  });
});
