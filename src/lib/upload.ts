import { api } from "@convex/_generated/api";
import {
  MEDIA_LIMITS,
  MEGABYTE,
  type MediaType,
  classifyMedia,
} from "@convex/media";
import type { ConvexClient } from "convex/browser";

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
      else if (xhr.status === 0) reject(new Error(r2NetworkError()));
      else
        reject(new Error(`Upload failed (${xhr.status} ${xhr.statusText}).`));
    };
    xhr.onerror = () => reject(new Error(r2NetworkError()));
    xhr.send(file);
  });
}

function r2NetworkError(): string {
  return (
    "Upload failed before R2 accepted the file. If you're running locally, " +
    "check that the R2 bucket CORS policy allows this app origin, PUT, and " +
    "the Content-Type header."
  );
}

export type MemeVisibility = "public" | "private";

/** The metadata half of a publish: what the shared `MetadataForm` collects. */
export interface MemeMetadata {
  title?: string;
  tags: string[];
  visibility: MemeVisibility;
}

/**
 * Split a free-text tag field into raw tags. Only the cheap structural split
 * (on commas) happens client-side; canonicalization — trim, lowercase,
 * de-dupe — is left to the server (`canonicalizeTags`), so the client never
 * mirrors those rules. Shared by the upload page and the creator's publish
 * form.
 */
export function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Upload a browser `File` to R2 through the presigned-PUT flow and return its
 * object key, with metadata synced so a following `createMeme`/`createTemplate`
 * can read content-type + size deterministically. The single R2 entry point
 * shared by the upload page, the creator's meme publish, and the creator's
 * template save (#84) — each is one independent upload.
 */
export async function uploadFileToR2(
  client: ConvexClient,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const { url, key } = await client.mutation(api.r2.generateUploadUrl, {});
  await putToR2(url, file, onProgress);
  await client.action(api.r2.syncUploadedMetadata, { key });
  return key;
}

/**
 * Publish a meme end to end: upload the file, then run the standard
 * `createMeme` validation + insert. Used by both the upload page and the
 * creator so the two share one pipeline (the creator's composed image is a
 * plain uploaded meme — backend-blind, ADR 0020).
 */
export async function publishMeme(
  client: ConvexClient,
  file: File,
  meta: MemeMetadata,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const key = await uploadFileToR2(client, file, onProgress);
  await client.action(api.memes.createMeme, {
    key,
    title: meta.title,
    tags: meta.tags,
    visibility: meta.visibility,
  });
}
