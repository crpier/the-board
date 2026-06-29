import { getAuthUserId } from "@convex-dev/auth/server";
import { R2 } from "@convex-dev/r2";
import type { GenericQueryCtx } from "convex/server";
import { v } from "convex/values";

import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";

/**
 * R2 object store for meme media (see ADR 0005).
 *
 * The component reads its bucket credentials from the Convex deployment env
 * (`R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`), so
 * the constructor takes no options. Set them with `npx convex env set`.
 */
export const r2 = new R2(components.r2);

/**
 * Base URL of the Cloudflare custom domain bound to the bucket, e.g.
 * `https://media.example.com`. Public serving must go through this domain: the
 * `r2.dev` URL is rate-limited and dev-only, and the component's `getUrl`
 * returns a short-lived *presigned* endpoint URL, not a cacheable CDN URL.
 */
function cdnBase(): string {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) {
    throw new Error(
      "R2_PUBLIC_URL is not set. Configure the Cloudflare custom domain with " +
        "`npx convex env set R2_PUBLIC_URL https://<your-domain>`.",
    );
  }
  return base.replace(/\/+$/, "");
}

/**
 * Resolve an R2 object key to its public CDN URL on the Cloudflare custom
 * domain. Backend helper for reuse by the upload/serve flows; key segments are
 * encoded individually so `/` stays a path separator.
 */
export function resolveUrl(key: string): string {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  return `${cdnBase()}/${encoded}`;
}

/**
 * Resolve a key to its CDN URL from the client. Returns `null` for an empty
 * key so callers can render a placeholder instead of throwing.
 */
export const getMediaUrl = query({
  args: { key: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (_ctx, args) => {
    return args.key ? resolveUrl(args.key) : null;
  },
});

/**
 * Require an authenticated user. Upload and delete are participation flows, so
 * guests must not get a presigned URL or be able to remove objects.
 */
async function requireUser(ctx: GenericQueryCtx<DataModel>) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Not authenticated");
  }
}

/**
 * Client-facing R2 API, exposed for the `useUploadFile` hook and direct calls:
 *
 * - `generateUploadUrl` — presigned PUT URL (auth-gated).
 * - `syncMetadata` — HEAD the object and store content-type + size in Convex.
 * - `getMetadata` — read the stored content-type + size back.
 * - `deleteObject` — remove the object and its metadata (auth-gated).
 *
 * Object lifecycle (binding key → meme, optimization, publish) is wired in
 * later slices; this slice only moves and serves bytes.
 */
export const { generateUploadUrl, syncMetadata, getMetadata, deleteObject } =
  r2.clientApi<DataModel>({
    checkUpload: async (ctx) => {
      await requireUser(ctx);
    },
    checkDelete: async (ctx) => {
      await requireUser(ctx);
    },
  });
