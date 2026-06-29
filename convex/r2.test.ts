/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/**
 * `getMediaUrl` is a pure key → CDN URL resolver, so it never touches the R2
 * component and can be exercised without a mounted bucket. The presigned
 * upload / metadata / delete helpers are component-backed and require a real
 * bucket, so they are covered by the manual acceptance check in the PR, not here.
 */
describe("getMediaUrl", () => {
  const prev = process.env.R2_PUBLIC_URL;

  beforeEach(() => {
    process.env.R2_PUBLIC_URL = "https://media.example.com/";
  });

  afterEach(() => {
    process.env.R2_PUBLIC_URL = prev;
  });

  test("resolves a key to the Cloudflare custom domain", async () => {
    const t = convexTest(schema, modules);
    const url = await t.query(api.r2.getMediaUrl, { key: "abc/def.png" });
    // Trailing slash on the base is trimmed; path segments are preserved.
    expect(url).toBe("https://media.example.com/abc/def.png");
  });

  test("encodes unsafe characters per segment but keeps slashes", async () => {
    const t = convexTest(schema, modules);
    const url = await t.query(api.r2.getMediaUrl, { key: "a b/c?d.png" });
    expect(url).toBe("https://media.example.com/a%20b/c%3Fd.png");
  });

  test("returns null for an empty key", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.r2.getMediaUrl, { key: "" })).toBeNull();
  });

  test("throws when the custom domain is not configured", async () => {
    delete process.env.R2_PUBLIC_URL;
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.r2.getMediaUrl, { key: "abc.png" }),
    ).rejects.toThrow(/R2_PUBLIC_URL/);
  });
});
