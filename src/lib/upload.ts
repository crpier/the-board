import {
  MEDIA_LIMITS,
  MEGABYTE,
  type MediaType,
  classifyMedia,
} from "@convex/media";

/**
 * Result of validating a picked file against the same rules the server enforces.
 * `ok: false` carries a human-readable reason to show inline; `ok: true` carries
 * the resolved `mediaType` so the caller can label the preview.
 */
export type FileCheck =
  | { ok: true; mediaType: MediaType }
  | { ok: false; error: string };

/**
 * Client-side gate for instant feedback before we request a presigned URL: reject
 * unsupported types and oversized files up front. The server re-derives both from
 * the real R2 object and remains the authority (ADR 0007) — this only saves a
 * doomed round trip and gives the user a fast, specific error.
 */
export function validateFile(file: File): FileCheck {
  const mediaType = classifyMedia(file.type);
  if (mediaType === null) {
    return {
      ok: false,
      error: "Unsupported file. Pick an image, GIF, or video.",
    };
  }
  const limit = MEDIA_LIMITS[mediaType];
  if (file.size > limit) {
    return {
      ok: false,
      error: `That ${mediaType} is too large. The limit is ${limit / MEGABYTE} MB.`,
    };
  }
  return { ok: true, mediaType };
}

/**
 * PUT the file to its presigned R2 URL with optional progress. Mirrors the
 * `@convex-dev/r2` React helper (which we can't use — it's React-only): the
 * upload bypasses Convex and goes straight to the bucket, so we drive it with a
 * raw `XMLHttpRequest` to get upload-progress events `fetch` doesn't expose.
 */
export function putToR2(
  url: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(new Error(`Upload failed (${xhr.status} ${xhr.statusText}).`));
    };
    xhr.onerror = () =>
      reject(new Error("Upload failed. Check your connection."));
    xhr.send(file);
  });
}
