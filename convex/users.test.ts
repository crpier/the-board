/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const firstPage = { paginationOpts: { numItems: 10, cursor: null } };

function seedUser(
  t: ReturnType<typeof convexTest>,
  overrides: Record<string, unknown> = {},
) {
  return t.run(async (ctx) =>
    ctx.db.insert("users", { name: "User", ...overrides }),
  );
}

function seedAdmin(t: ReturnType<typeof convexTest>, overrides = {}) {
  return seedUser(t, { name: "Admin", isAdmin: true, ...overrides });
}

function identity(userId: string) {
  return { subject: `${userId}|session` };
}

describe("listUsers", () => {
  test("an admin sees every user with their resolved role", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const plebId = await seedUser(t, { name: "Pleb" });
    const asAdmin = t.withIdentity(identity(adminId));

    const page = await asAdmin.query(api.users.listUsers, firstPage);

    expect(page.page).toHaveLength(2);
    const byId = new Map(page.page.map((row) => [row._id, row]));
    expect(byId.get(adminId)?.isAdmin).toBe(true);
    expect(byId.get(plebId)?.isAdmin).toBe(false);
    expect(byId.get(plebId)?.displayName).toBe("Pleb");
  });

  test("rejects a non-admin", async () => {
    const t = convexTest(schema, modules);
    const plebId = await seedUser(t);
    const asPleb = t.withIdentity(identity(plebId));

    await expect(asPleb.query(api.users.listUsers, firstPage)).rejects.toThrow(
      "Admin access required.",
    );
  });

  test("rejects a guest", async () => {
    const t = convexTest(schema, modules);

    await expect(t.query(api.users.listUsers, firstPage)).rejects.toThrow(
      "Admin access required.",
    );
  });
});

describe("promoteUser", () => {
  test("an admin promotes a second user to admin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const plebId = await seedUser(t);
    const asAdmin = t.withIdentity(identity(adminId));

    await asAdmin.mutation(api.users.promoteUser, { userId: plebId });

    const promoted = await t.run(async (ctx) => ctx.db.get(plebId));
    expect(promoted?.isAdmin).toBe(true);
  });

  test("a newly promoted admin can perform moderation actions", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const plebId = await seedUser(t);
    const otherId = await seedUser(t, { name: "Author" });
    const memeId = await t.run(async (ctx) =>
      ctx.db.insert("memes", {
        visibility: "public",
        status: "ready",
        mediaKey: "memes/abc.png",
        mediaType: "image",
        tags: [],
        authorId: otherId,
        upvoteCount: 0,
        downvoteCount: 0,
      }),
    );

    const asAdmin = t.withIdentity(identity(adminId));
    await asAdmin.mutation(api.users.promoteUser, { userId: plebId });

    const asPromoted = t.withIdentity(identity(plebId));
    await asPromoted.mutation(api.memes.moderateMeme, {
      memeId,
      visibility: "private",
    });

    const meme = await t.run(async (ctx) => ctx.db.get(memeId));
    expect(meme?.visibility).toBe("private");
  });

  test("is idempotent when the target is already an admin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const otherAdminId = await seedAdmin(t, { name: "Other admin" });
    const asAdmin = t.withIdentity(identity(adminId));

    await expect(
      asAdmin.mutation(api.users.promoteUser, { userId: otherAdminId }),
    ).resolves.toBeNull();

    const stillAdmin = await t.run(async (ctx) => ctx.db.get(otherAdminId));
    expect(stillAdmin?.isAdmin).toBe(true);
  });

  test("rejects a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const plebId = await seedUser(t);
    const targetId = await seedUser(t, { name: "Target" });
    const asPleb = t.withIdentity(identity(plebId));

    await expect(
      asPleb.mutation(api.users.promoteUser, { userId: targetId }),
    ).rejects.toThrow("Admin access required.");

    const target = await t.run(async (ctx) => ctx.db.get(targetId));
    expect(target?.isAdmin).toBeFalsy();
  });
});

describe("demoteUser", () => {
  test("an admin demotes another admin when more than one admin remains", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const otherAdminId = await seedAdmin(t, { name: "Other admin" });
    const asAdmin = t.withIdentity(identity(adminId));

    await asAdmin.mutation(api.users.demoteUser, { userId: otherAdminId });

    const demoted = await t.run(async (ctx) => ctx.db.get(otherAdminId));
    expect(demoted?.isAdmin).toBe(false);
  });

  test("blocks demoting the last remaining admin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const asAdmin = t.withIdentity(identity(adminId));

    await expect(
      asAdmin.mutation(api.users.demoteUser, { userId: adminId }),
    ).rejects.toThrow("Cannot demote the last remaining admin.");

    const stillAdmin = await t.run(async (ctx) => ctx.db.get(adminId));
    expect(stillAdmin?.isAdmin).toBe(true);
  });

  test("blocks self-demotion when the caller is the last admin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const plebId = await seedUser(t);
    const asAdmin = t.withIdentity(identity(adminId));

    // Demoting a non-admin is a no-op, not blocked — only demoting the last
    // *admin* is guarded.
    await expect(
      asAdmin.mutation(api.users.demoteUser, { userId: plebId }),
    ).resolves.toBeNull();

    await expect(
      asAdmin.mutation(api.users.demoteUser, { userId: adminId }),
    ).rejects.toThrow("Cannot demote the last remaining admin.");
  });

  test("is a no-op when the target isn't currently an admin", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const plebId = await seedUser(t);
    const asAdmin = t.withIdentity(identity(adminId));

    await expect(
      asAdmin.mutation(api.users.demoteUser, { userId: plebId }),
    ).resolves.toBeNull();
  });

  test("rejects a non-admin caller", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const plebId = await seedUser(t);
    const asPleb = t.withIdentity(identity(plebId));

    await expect(
      asPleb.mutation(api.users.demoteUser, { userId: adminId }),
    ).rejects.toThrow("Admin access required.");

    const stillAdmin = await t.run(async (ctx) => ctx.db.get(adminId));
    expect(stillAdmin?.isAdmin).toBe(true);
  });

  test("rejects a guest", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);

    await expect(
      t.mutation(api.users.demoteUser, { userId: adminId }),
    ).rejects.toThrow("Admin access required.");
  });
});
