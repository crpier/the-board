# ADR 0015 - Convex Http Action for Open Graph Unfurls

Date: 2026-07-17
Status: accepted

## Context

`/meme/:id` has no share/copy-link action and no Open Graph or Twitter Card
meta tags (#64), so links pasted into Discord/Slack/WhatsApp/Twitter don't
unfurl with the meme's image and title.

ADR 0002 commits the app to client-side rendering: `ssr` is disabled, static
assets are the deployment artifact, and Convex owns backend behavior. That
means `/meme/:id` on the real app origin never returns server-rendered HTML.
Link-unfurl bots fetch a URL and parse the HTML they get back; they don't run
JavaScript. Hit with the CSR shell, they see an empty `<head>` and no `og:*`
tags, no matter what the client mounts afterward.

Producing real server-rendered meta tags at that exact URL would require
either standing up a server-rendering backend (reversing ADR 0002 for one
route) or per-request logic on the static host (e.g. Cloudflare Pages
Functions), which the project doesn't use today and which would split
request-time logic across two systems (Cloudflare + Convex) instead of one.

## Decision

Serve Open Graph / Twitter Card metadata from a **Convex http action**
(`convex/http.ts`, `GET /meme/:id` on the deployment's `.convex.site` origin)
rather than from the SPA route, and make that http action URL the **canonical
share link** the client copies/shares — not the bare SPA URL.

The handler:

1. Extracts the meme id from the path and calls `api.memes.getMeme` — the same
   query the detail page's live subscription uses, so visibility rules never
   diverge between the two surfaces. An http action request carries no Convex
   auth session, so `getMeme` always resolves the caller as a signed-out
   guest: a private, hidden, or not-`ready` meme returns `null` here exactly
   as it does for any other unauthenticated visitor, and the handler renders
   the generic fallback (title `"The Board"`, no image) instead of the real
   metadata.
2. Renders a minimal HTML document with `og:title`, `og:description`,
   `og:image` (image/GIF memes only — a video file isn't a valid `og:image`),
   `og:url`, and matching `twitter:*` tags, all HTML-escaped since title is
   user-authored text.
3. Redirects to the real SPA route (`<meta http-equiv="refresh">` plus a JS
   `location.replace`) so a human who opens the link lands on the live app
   almost instantly. Bots read the meta tags from the initial response and
   don't need to (and generally don't) follow the redirect.

`ShareButton` (`src/components/ShareButton.tsx`) builds links against
`VITE_CONVEX_SITE_URL` — already part of the client env (`src/env.ts`) — plus
`/meme/:id`, instead of `window.location.origin`.

A new Convex deployment env var, `APP_URL`, holds the SPA's real origin so the
handler knows where to redirect (`npx convex env set APP_URL https://<domain>`
in every deployment; defaults to `http://localhost:5000` for local dev,
mirroring the `R2_PUBLIC_URL` pattern in ADR 0005).

## Considered alternatives

- **Re-enable SSR for the detail route only.** Would give the SPA URL itself
  real meta tags, so the share link and the app URL stay identical. Rejected:
  ADR 0002 deliberately dropped SSR to avoid a second rendering pipeline
  (Convex HTTP prefetch, SolidStart server data APIs, hydration coordination);
  clawing it back for one route reopens exactly that cost for a
  metadata-only need.
- **Static-host edge function (e.g. Cloudflare Pages Function) that
  intercepts `/meme/:id` by user-agent.** Would keep the share link identical
  to the app URL. Rejected: no such infra exists in this repo today, bot
  user-agent sniffing is inherently a maintained allowlist that silently rots
  as crawlers change strings, and it would split request-time logic across
  Cloudflare and Convex instead of keeping it in the one backend the project
  already treats as the source of truth for server behavior.
- **Prerendering/static snapshot generation per meme.** Doesn't fit a
  frequently-changing, per-user-visibility dataset (a meme can flip
  public → private after a snapshot was generated) and adds a build/publish
  pipeline this project doesn't have.

## Consequences

- The URL a user copies/shares is on the `.convex.site` origin, not the app's
  own domain — visibly different if someone inspects it before clicking,
  though the redirect lands them on the real app URL immediately. This is the
  direct cost of not reversing ADR 0002.
- `og:url` in the served page points at the real app origin (`APP_URL`), so
  platforms that surface a "visit site" link using `og:url` rather than the
  fetched URL still point users at the canonical app.
- Deploying now requires setting `APP_URL` in the Convex environment in
  addition to the existing `R2_*` variables; a missing value only degrades to
  the local dev origin, so a misconfigured deployment fails soft (wrong
  redirect target) rather than hard.
- Video memes unfurl with title/description but no image thumbnail — this ADR
  and #64 do not cover video thumbnail generation.
