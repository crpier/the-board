import { httpRouter } from "convex/server";

import { api } from "./_generated/api";
import type { FeedMeme } from "./memes";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

const SITE_NAME = "The Board";
const FALLBACK_TITLE = SITE_NAME;
const FALLBACK_DESCRIPTION = "A meme sharing community.";

/**
 * Origin of the deployed SPA, e.g. `https://the-board.example.com`. The http
 * action redirects browsers here after serving the meta tags — set with
 * `npx convex env set APP_URL https://<your-domain>` in every deployment.
 * Falls back to the local dev origin so a missing var doesn't break `pnpm dev`.
 */
function appOrigin(): string {
  const configured = process.env.APP_URL;
  return (configured ?? "http://localhost:5000").replace(/\/+$/, "");
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render the server-side HTML shell for a `/meme/:id` share link: real
 * `og:*`/`twitter:*` tags for `meme`, then an immediate redirect to the SPA
 * route so a human who clicks the link lands on the live app.
 *
 * `meme` is already visibility-filtered by the caller (`api.memes.getMeme`) —
 * `null` covers every non-viewable case (bad id, hidden, not-yet-ready,
 * someone else's private meme) identically, so this only ever renders the
 * generic fallback title/description for those, never the real ones.
 */
function renderMemeShell(meme: FeedMeme | null, appUrl: string): string {
  const title = meme
    ? `${meme.title ?? "Meme"} · ${SITE_NAME}`
    : FALLBACK_TITLE;
  const description = meme
    ? `Posted by @${meme.authorName} on ${SITE_NAME}.`
    : FALLBACK_DESCRIPTION;
  // Unfurlers expect `og:image` to be a static image; a video file doesn't
  // reliably render as one, so video memes unfurl with title + description
  // only (no broken/blank thumbnail).
  const image = meme && meme.mediaType !== "video" ? meme.mediaUrl : null;

  const metaTags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(appUrl)}">`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : "",
  ]
    .filter(Boolean)
    .join("\n    ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    ${metaTags}
    <meta http-equiv="refresh" content="0; url=${escapeHtml(appUrl)}">
    <link rel="canonical" href="${escapeHtml(appUrl)}">
  </head>
  <body>
    <p>Redirecting to <a href="${escapeHtml(appUrl)}">${escapeHtml(title)}</a>&hellip;</p>
    <script>location.replace(${JSON.stringify(appUrl)});</script>
  </body>
</html>
`;
}

/**
 * Serves server-rendered `og:*`/`twitter:*` tags for `/meme/:id` (#64).
 *
 * The app is CSR-only (ADR 0002) and hosted as static assets, so `/meme/:id`
 * on the real app origin never returns server-rendered HTML — a link-unfurl
 * bot (Discord, Slack, WhatsApp, Twitter), which fetches the URL but never
 * runs JS, would only ever see an empty shell with no title or image. Those
 * bots do run a normal HTTP fetch though, so a Convex http action can serve
 * them (and everyone else, since there's no reliable way to bot-detect a UA
 * string) real meta tags at request time. This route is therefore the
 * canonical "share link" the client copies (see `src/components/ShareButton.tsx`)
 * rather than the bare SPA URL — only this URL has tags for an unfurl to read.
 * A human who opens it is redirected to the real app route immediately (meta
 * refresh + JS, both targeting the same URL).
 *
 * Visibility is enforced by delegating straight to `api.memes.getMeme`, the
 * same authorization the detail page's live query runs. An http action
 * request carries no Convex auth session, so `getMeme` always resolves the
 * caller as a signed-out guest here — meaning a private or hidden meme's real
 * title/image can never reach an unfurl, regardless of who owns the link.
 */
http.route({
  pathPrefix: "/meme/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    // Malformed percent-encoding (e.g. a bare `%`) makes `decodeURIComponent`
    // throw. Treat that the same as any other unrecognized id rather than
    // letting the error escape the http action.
    let id: string;
    try {
      id = decodeURIComponent(url.pathname.slice("/meme/".length));
    } catch {
      id = "";
    }
    const appUrl = id
      ? `${appOrigin()}/meme/${encodeURIComponent(id)}`
      : `${appOrigin()}/`;

    const meme: FeedMeme | null = id
      ? await ctx.runQuery(api.memes.getMeme, { id })
      : null;

    return new Response(renderMemeShell(meme, appUrl), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }),
});

export default http;
