import { MEGABYTE } from "@convex/media";
import { describe, expect, test } from "vitest";

import { validateFile } from "./upload";

/**
 * Build a `File` of an exact byte size without allocating real bytes: the size
 * comes from the blob's length, so a single padded string of `size` chars is
 * enough for the validator, which only reads `type` and `size`.
 */
function fakeFile(type: string, size: number): File {
  return new File(["x".repeat(size)], "meme", { type });
}

describe("validateFile (client gate)", () => {
  test("accepts an image within the limit and resolves its type", () => {
    const result = validateFile(fakeFile("image/png", 1 * MEGABYTE));
    expect(result).toEqual({ ok: true, mediaType: "image" });
  });

  test("classifies image/gif as gif, not image", () => {
    // A 20 MB GIF is over the 10 MB image ceiling but under the 25 MB GIF one,
    // so getting the type right is what keeps it from being wrongly rejected.
    const result = validateFile(fakeFile("image/gif", 20 * MEGABYTE));
    expect(result).toEqual({ ok: true, mediaType: "gif" });
  });

  test("rejects an unsupported type", () => {
    const result = validateFile(fakeFile("application/pdf", 1));
    expect(result.ok).toBe(false);
  });

  test("rejects a file over its per-type ceiling", () => {
    const result = validateFile(fakeFile("image/png", 11 * MEGABYTE));
    expect(result.ok).toBe(false);
  });
});
