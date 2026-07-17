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
 * bucket, so the full upload → serve round trip is covered by the manual
 * acceptance check in the PR, not here. The auth gate runs before any bucket
 * call, so it is verified below without a mounted bucket.
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

describe("upload auth gate", () => {
  test("rejects an unauthenticated generateUploadUrl call", async () => {
    const t = convexTest(schema, modules);
    // No identity: checkUpload runs before any bucket call and must reject.
    await expect(t.mutation(api.r2.generateUploadUrl, {})).rejects.toThrow(
      /Not authenticated/,
    );
  });

  test("rejects an unauthenticated syncUploadedMetadata call", async () => {
    const t = convexTest(schema, modules);
    // Auth runs before the action tries to HEAD the real bucket.
    await expect(
      t.action(api.r2.syncUploadedMetadata, { key: "memes/cat.jpg" }),
    ).rejects.toThrow(/Not authenticated/);
  });
});
