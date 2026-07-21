/// <reference types="vite/client" />
import actionRetrier from "@convex-dev/action-retrier/test";
import r2Test from "@convex-dev/r2/test";
import { isRateLimitError } from "@convex-dev/rate-limiter";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const firstPage = { paginationOpts: { numItems: 20, cursor: null } };
const MB = 1024 * 1024;

// Same dummy R2 credentials memes.test.ts sets: the component's metadata
// query/delete run without a real bucket, and presigning is pure local crypto.
process.env.R2_BUCKET = "test-bucket";
process.env.R2_ENDPOINT = "https://test.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";

/**
 * Stand up a test instance with every component `createTemplate` touches (R2 +
 * its nested action-retrier, and the rate limiter) mounted, seed a user, an
 * admin, and a separate reporter, and return clients scoped to each.
 */
async function setup() {
  const t = convexTest(schema, modules);
  r2Test.register(t);
  actionRetrier.register(t, "r2/actionRetrier");
  rateLimiterTest.register(t);

  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { name: "Maker" }),
  );
  const adminId = await t.run((ctx) =>
    ctx.db.insert("users", { name: "Admin", isAdmin: true }),
  );
  const reporterId = await t.run((ctx) =>
    ctx.db.insert("users", { name: "Reporter" }),
  );

  return {
    t,
    userId,
    adminId,
    reporterId,
    asUser: t.withIdentity({ subject: `${userId}|session` }),
    asAdmin: t.withIdentity({ subject: `${adminId}|session` }),
    asReporter: t.withIdentity({ subject: `${reporterId}|session` }),
  };
}

/** Seed the R2 metadata for `key` as if `syncMetadata` had run after a PUT. */
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

/** Insert a ready template directly, bypassing the upload action. */
function seedTemplate(
  t: ReturnType<typeof convexTest>,
  authorId: Id<"users">,
  overrides: Record<string, unknown> = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("templates", {
      name: "Template",
      searchText: "template",
      mediaKey: `templates/${Math.random()}.png`,
      mediaType: "image",
      status: "ready",
      authorId,
      ...overrides,
    }),
  );
}

function getTemplateDoc(
  t: ReturnType<typeof convexTest>,
  templateId: Id<"templates">,
) {
  return t.run((ctx) => ctx.db.get(templateId));
}

// resolveUrl needs the CDN base for every list/get/queue read.
const prevPublicUrl = process.env.R2_PUBLIC_URL;
beforeEach(() => {
  process.env.R2_PUBLIC_URL = "https://media.example.com";
});
afterEach(() => {
  process.env.R2_PUBLIC_URL = prevPublicUrl;
});

describe("createTemplate", () => {
  test("a valid static image is saved ready, owned by the caller, with a trimmed name", async () => {
    const { t, userId, asUser } = await setup();
    await seedObject(t, "templates/drake.png", "image/png", 2 * MB);

    const templateId = await asUser.action(api.templates.createTemplate, {
      key: "templates/drake.png",
      name: "  Drake  ",
    });

    const template = await getTemplateDoc(t, templateId);
    expect(template).toMatchObject({
      name: "Drake",
      searchText: "drake",
      mediaKey: "templates/drake.png",
      mediaType: "image",
      status: "ready",
      authorId: userId,
    });
  });

  test("a blank name is rejected", async () => {
    const { t, asUser } = await setup();
    await seedObject(t, "templates/x.png", "image/png", MB);

    await expect(
      asUser.action(api.templates.createTemplate, {
        key: "templates/x.png",
        name: "   ",
      }),
    ).rejects.toThrow("needs a name");
  });

  test("an over-long name is rejected", async () => {
    const { t, asUser } = await setup();
    await seedObject(t, "templates/x.png", "image/png", MB);

    await expect(
      asUser.action(api.templates.createTemplate, {
        key: "templates/x.png",
        name: "a".repeat(200),
      }),
    ).rejects.toThrow("too long");
  });

  test("signed-out callers are rejected", async () => {
    const { t } = await setup();
    await seedObject(t, "templates/x.png", "image/png", MB);

    await expect(
      t.action(api.templates.createTemplate, {
        key: "templates/x.png",
        name: "Nope",
      }),
    ).rejects.toThrow();
  });

  test("a GIF base is rejected and its orphaned object is deleted", async () => {
    const { t, asUser } = await setup();
    await seedObject(t, "templates/anim.gif", "image/gif", MB);

    await expect(
      asUser.action(api.templates.createTemplate, {
        key: "templates/anim.gif",
        name: "Animated",
      }),
    ).rejects.toThrow("static image");

    expect(await objectExists(t, "templates/anim.gif")).toBe(false);
    expect(
      await t.run((ctx) => ctx.db.query("templates").collect()),
    ).toHaveLength(0);
  });

  test("an oversized image is rejected and its object is deleted", async () => {
    const { t, asUser } = await setup();
    await seedObject(t, "templates/huge.png", "image/png", 11 * MB);

    await expect(
      asUser.action(api.templates.createTemplate, {
        key: "templates/huge.png",
        name: "Huge",
      }),
    ).rejects.toThrow("limit");
    expect(await objectExists(t, "templates/huge.png")).toBe(false);
  });

  test("exceeding the per-user upload rate limit throws a typed RateLimited error", async () => {
    const { t, asUser } = await setup();

    // `createTemplate` shares the `uploadMeme` 10/hour token bucket, so the
    // 11th save in quick succession exhausts it.
    for (let i = 0; i < 10; i++) {
      const key = `templates/t-${i}.png`;
      await seedObject(t, key, "image/png", MB);
      await asUser.action(api.templates.createTemplate, {
        key,
        name: `T${i}`,
      });
    }

    const rejection = asUser.action(api.templates.createTemplate, {
      key: "templates/t-10.png",
      name: "Over",
    });
    await expect(rejection).rejects.toThrow();
    const error = await rejection.catch((e: unknown) => e);
    expect(isRateLimitError(error)).toBe(true);
    if (isRateLimitError(error)) {
      expect(error.data.name).toBe("uploadMeme");
    }
  });

  test("a failed save does not consume the rate limit", async () => {
    const { t, asUser } = await setup();
    // A GIF rejection happens after the non-consuming peek but before the
    // token is consumed (that only happens in `insertTemplate`), so a later
    // valid save must still succeed.
    await seedObject(t, "templates/bad.gif", "image/gif", MB);
    await expect(
      asUser.action(api.templates.createTemplate, {
        key: "templates/bad.gif",
        name: "Bad",
      }),
    ).rejects.toThrow();

    await seedObject(t, "templates/good.png", "image/png", MB);
    const id = await asUser.action(api.templates.createTemplate, {
      key: "templates/good.png",
      name: "Good",
    });
    expect(id).toBeDefined();
  });
});

describe("listTemplates", () => {
  test("returns ready templates newest-first, to any viewer (always public)", async () => {
    const { t, userId } = await setup();
    const a = await seedTemplate(t, userId, { name: "A" });
    const b = await seedTemplate(t, userId, { name: "B" });
    const c = await seedTemplate(t, userId, { name: "C" });

    // A guest (no identity) can browse the library.
    const result = await t.query(api.templates.listTemplates, firstPage);
    expect(result.page.map((p) => p._id)).toEqual([c, b, a]);
    expect(result.page[0]).toMatchObject({
      name: "C",
      mediaUrl: expect.stringContaining("https://media.example.com/"),
      isOwner: false,
      canModerate: false,
    });
  });

  test("excludes deleted templates", async () => {
    const { t, userId } = await setup();
    await seedTemplate(t, userId, { name: "Live" });
    await seedTemplate(t, userId, {
      name: "Gone",
      status: "deleted",
      deletedAt: Date.now(),
    });

    const result = await t.query(api.templates.listTemplates, firstPage);
    expect(result.page.map((p) => p.name)).toEqual(["Live"]);
  });

  test("marks the owner and admins on their view", async () => {
    const { t, userId, asUser, asAdmin } = await setup();
    await seedTemplate(t, userId, { name: "Mine" });

    const owner = await asUser.query(api.templates.listTemplates, firstPage);
    expect(owner.page[0]).toMatchObject({ isOwner: true, canModerate: false });

    const admin = await asAdmin.query(api.templates.listTemplates, firstPage);
    expect(admin.page[0]).toMatchObject({ isOwner: false, canModerate: true });
  });
});

describe("searchTemplates", () => {
  test("matches templates by name and excludes deleted ones", async () => {
    const { t, userId } = await setup();
    await seedTemplate(t, userId, {
      name: "Drake Hotline",
      searchText: "drake hotline",
    });
    await seedTemplate(t, userId, {
      name: "Distracted Boyfriend",
      searchText: "distracted boyfriend",
    });
    await seedTemplate(t, userId, {
      name: "Drake Deleted",
      searchText: "drake deleted",
      status: "deleted",
      deletedAt: Date.now(),
    });

    const result = await t.query(api.templates.searchTemplates, {
      query: "drake",
      ...firstPage,
    });
    expect(result.page.map((p) => p.name)).toEqual(["Drake Hotline"]);
  });

  test("an empty query returns an empty page", async () => {
    const { t, userId } = await setup();
    await seedTemplate(t, userId, { name: "Anything" });

    const result = await t.query(api.templates.searchTemplates, {
      query: "   ",
      ...firstPage,
    });
    expect(result.page).toHaveLength(0);
    expect(result.isDone).toBe(true);
  });
});

describe("getTemplate", () => {
  test("returns a ready template's view", async () => {
    const { t, userId } = await setup();
    const id = await seedTemplate(t, userId, { name: "Pick me" });

    const view = await t.query(api.templates.getTemplate, { id });
    expect(view).toMatchObject({ _id: id, name: "Pick me" });
  });

  test("returns null for a malformed id, a missing template, and a deleted one", async () => {
    const { t, userId } = await setup();
    expect(
      await t.query(api.templates.getTemplate, { id: "nonsense" }),
    ).toBeNull();

    const deleted = await seedTemplate(t, userId, {
      status: "deleted",
      deletedAt: Date.now(),
    });
    expect(
      await t.query(api.templates.getTemplate, { id: deleted }),
    ).toBeNull();
  });
});

describe("deleteTemplate", () => {
  test("owner soft-deletes and schedules a reclaim, keeping the object", async () => {
    const { t, userId, asUser } = await setup();
    const id = await seedTemplate(t, userId, {
      mediaKey: "templates/keep.png",
    });
    await seedObject(t, "templates/keep.png", "image/png", MB);

    await asUser.mutation(api.templates.deleteTemplate, { templateId: id });

    const doc = await getTemplateDoc(t, id);
    expect(doc?.status).toBe("deleted");
    expect(doc?.deletedAt).toBeDefined();
    expect(doc?.reclaimJobId).toBeDefined();
    // R2 object is untouched during the undo window.
    expect(await objectExists(t, "templates/keep.png")).toBe(true);
  });

  test("a non-owner cannot delete", async () => {
    const { t, userId, asReporter } = await setup();
    const id = await seedTemplate(t, userId);

    await expect(
      asReporter.mutation(api.templates.deleteTemplate, { templateId: id }),
    ).rejects.toThrow("your own templates");
  });

  test("a guest cannot delete", async () => {
    const { t, userId } = await setup();
    const id = await seedTemplate(t, userId);

    await expect(
      t.mutation(api.templates.deleteTemplate, { templateId: id }),
    ).rejects.toThrow();
  });
});

describe("removeTemplate (admin)", () => {
  test("an admin can remove any template", async () => {
    const { t, userId, asAdmin } = await setup();
    const id = await seedTemplate(t, userId);

    await asAdmin.mutation(api.templates.removeTemplate, { templateId: id });
    expect((await getTemplateDoc(t, id))?.status).toBe("deleted");
  });

  test("a non-admin is rejected with an opaque not-found", async () => {
    const { t, userId, asReporter } = await setup();
    const id = await seedTemplate(t, userId);

    await expect(
      asReporter.mutation(api.templates.removeTemplate, { templateId: id }),
    ).rejects.toThrow("Template not found.");
    expect((await getTemplateDoc(t, id))?.status).toBe("ready");
  });
});

describe("restoreTemplate and the reclaim window", () => {
  test("the owner can restore within the window, cancelling the reclaim", async () => {
    const { t, userId, asUser } = await setup();
    const id = await seedTemplate(t, userId, { mediaKey: "templates/r.png" });
    await seedObject(t, "templates/r.png", "image/png", MB);

    await asUser.mutation(api.templates.deleteTemplate, { templateId: id });
    await asUser.mutation(api.templates.restoreTemplate, { templateId: id });

    const doc = await getTemplateDoc(t, id);
    expect(doc?.status).toBe("ready");
    expect(doc?.deletedAt).toBeUndefined();
    expect(doc?.reclaimJobId).toBeUndefined();

    // A late-firing reclaim job must be a no-op on the restored template.
    await t.action(internal.templates.reclaimDeletedTemplate, {
      templateId: id,
    });
    expect((await getTemplateDoc(t, id))?.status).toBe("ready");
    expect(await objectExists(t, "templates/r.png")).toBe(true);
  });

  test("an admin can restore an admin-removed template", async () => {
    const { t, userId, asAdmin } = await setup();
    const id = await seedTemplate(t, userId);
    await asAdmin.mutation(api.templates.removeTemplate, { templateId: id });

    await asAdmin.mutation(api.templates.restoreTemplate, { templateId: id });
    expect((await getTemplateDoc(t, id))?.status).toBe("ready");
  });

  test("once the window elapses the object is reclaimed and restore fails", async () => {
    const { t, userId, asUser } = await setup();
    const id = await seedTemplate(t, userId, {
      mediaKey: "templates/gone.png",
    });
    await seedObject(t, "templates/gone.png", "image/png", MB);
    await asUser.mutation(api.templates.deleteTemplate, { templateId: id });

    // Simulate the scheduled reclaim firing after the undo window.
    await t.action(internal.templates.reclaimDeletedTemplate, {
      templateId: id,
    });

    expect((await getTemplateDoc(t, id))?.reclaimJobId).toBeUndefined();
    expect(await objectExists(t, "templates/gone.png")).toBe(false);
    await expect(
      asUser.mutation(api.templates.restoreTemplate, { templateId: id }),
    ).rejects.toThrow("can no longer be restored");
  });
});

describe("template reporting", () => {
  test("a signed-in user can report a template; it appears in the admin queue", async () => {
    const { t, userId, asReporter, asAdmin } = await setup();
    const id = await seedTemplate(t, userId, { name: "Rude" });

    await asReporter.mutation(api.reports.createTemplateReport, {
      templateId: id,
      reason: "hate_speech",
      details: "not okay",
    });

    expect(
      await asReporter.query(api.reports.myTemplateReportStatus, {
        templateId: id,
      }),
    ).toBe("open");

    const queue = await asAdmin.query(api.reports.listOpenReports, firstPage);
    expect(queue.page).toHaveLength(1);
    const item = queue.page[0];
    expect(item.targetType).toBe("template");
    if (item.targetType !== "template") throw new Error("expected template");
    expect(item).toMatchObject({
      templateId: id,
      templateAvailable: true,
      templateName: "Rude",
      reason: "hate_speech",
      details: "not okay",
    });
  });

  test("a second open report on the same template by the same user is rejected", async () => {
    const { t, userId, asReporter } = await setup();
    const id = await seedTemplate(t, userId);
    await asReporter.mutation(api.reports.createTemplateReport, {
      templateId: id,
      reason: "spam",
    });

    await expect(
      asReporter.mutation(api.reports.createTemplateReport, {
        templateId: id,
        reason: "other",
      }),
    ).rejects.toThrow("already reported");
  });

  test("reporting a removed template throws the opaque not-found", async () => {
    const { t, userId, asReporter } = await setup();
    const id = await seedTemplate(t, userId, {
      status: "deleted",
      deletedAt: Date.now(),
    });

    await expect(
      asReporter.mutation(api.reports.createTemplateReport, {
        templateId: id,
        reason: "spam",
      }),
    ).rejects.toThrow("Template not found.");
  });

  test("an admin resolving 'hide' on a template report removes the template", async () => {
    const { t, userId, asReporter, asAdmin } = await setup();
    const id = await seedTemplate(t, userId);
    const reportId = await asReporter.mutation(
      api.reports.createTemplateReport,
      { templateId: id, reason: "spam" },
    );

    await asAdmin.mutation(api.reports.resolveReport, {
      reportId,
      resolution: "hide",
    });

    expect((await getTemplateDoc(t, id))?.status).toBe("deleted");
    const report = await t.run((ctx) => ctx.db.get(reportId));
    expect(report?.status).toBe("resolved");
  });
});
