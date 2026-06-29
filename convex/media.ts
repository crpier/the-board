import type { Infer } from "convex/values";

import { mediaTypeValidator } from "./validators";

/**
 * Accepted-media rules shared by the upload UI and the server publish path.
 *
 * The client validates a picked file for instant feedback before requesting a
 * presigned URL, but the server remains the authority (it re-derives the type
 * and re-checks the size against the real R2 object). Both sides import these
 * same constants/helper so the client can't drift from what the server will
 * actually accept. This module is intentionally backend-free (only `convex/values`
 * types) so it is safe to bundle into the browser.
 */
export type MediaType = Infer<typeof mediaTypeValidator>;

export const MEGABYTE = 1024 * 1024;

/**
 * Per-type byte ceilings (`docs/product-overview.md`). Re-checked server-side in
 * `createMeme` against the object's real size.
 */
export const MEDIA_LIMITS: Record<MediaType, number> = {
  image: 10 * MEGABYTE,
  gif: 25 * MEGABYTE,
  video: 100 * MEGABYTE,
};

/**
 * Map a MIME content-type onto a meme `mediaType`, or `null` when the type is
 * not something we accept. Works for both an R2 object's stored content-type and
 * a browser `File.type`. GIFs arrive as `image/gif`, so they must be matched
 * before the generic `image/` prefix or every GIF would be classed as an image
 * and validated against the wrong (smaller) ceiling.
 */
export function classifyMedia(contentType: string): MediaType | null {
  const type = contentType.toLowerCase();
  if (type === "image/gif") return "gif";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  return null;
}
