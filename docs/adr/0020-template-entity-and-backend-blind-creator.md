# ADR 0020 - Template Entity and a Backend-Blind Meme Creator

Date: 2026-07-21
Status: accepted

## Context

The Meme Creator (#84) lets a member caption a base image in-app and either copy
the result or publish it, and lets members contribute base images to a shared
Template library. Two durable, cross-cutting questions had to be settled before
building it:

- **How does a created meme reach the backend?** Is "a meme made in the creator"
  a distinct backend concept (with provenance, editable layers, a link to its
  base) or just an image?
- **What is a Template, relative to a meme?** Is it a flag on `memes`, a special
  meme, or its own entity — and how does its lifecycle relate to the meme
  mechanics already built (publish validation, soft-delete + undo + delayed R2
  reclaim, admin moderation, reporting)?

The existing meme stack already established the shapes this reuses: presigned
R2 PUT + server-authoritative validation (ADR 0007/0008), read-time view-models
that never leak raw FKs (ADR 0006), owner soft-delete with a delayed reclaim and
an undo window (ADR 0009/0013), per-user rate limiting (ADR 0017), and the
reporting + admin review queue (ADR 0018).

## Decision

**The creator produces a flat static image that enters the existing upload
pipeline unchanged — the backend is blind to it.** Compositing (base image +
free-positioned caption boxes) happens entirely client-side on a canvas at
export; the result is uploaded and published through the same
`generateUploadUrl` → PUT → `syncMetadata` → `createMeme` flow as a raw upload,
with `mediaType: image`, the same validation, and the same rate limit. There are
**no provenance fields**, no link from a meme back to a Template, and no stored
text layers. The backend cannot tell a created meme from an uploaded one.

**A Template is its own entity (`templates` table), not a meme flag or a special
meme.** It has no votes and no feed presence, is always public, and stores
static images only under the existing image ceiling. It reuses the meme
mechanics wholesale rather than reimplementing them: presigned-R2-PUT upload via
`createTemplate` (an action, so a rejected upload deletes its orphaned object as
a separately committed step, exactly like `createMeme`), owner soft-delete with
the same undo window and delayed R2 reclaim, admin removal, and the same
per-user `uploadMeme` rate-limit bucket — a template save _is_ an upload.

**Reporting is extended to target a Template as well as a meme.** The `reports`
row gains an optional `templateId` alongside the existing optional `memeId`,
discriminated by which is present. This keeps the change migration-free:
existing meme reports validate unchanged, no `targetType` field is backfilled,
and the admin review queue resolves each row into a discriminated view-model so
it moderates both in one place. Resolving "hide" on a template report removes
the template via the same soft-delete core an owner delete uses.

**WYSIWYG parity is a construction, not a test target.** A single pure
text-layout module (line breaking + geometry, taking injected font metrics)
is shared by the DOM overlay and the canvas export, so the two cannot disagree
about where lines break. The bundled font (Anton, self-hosted via `@fontsource`
— no CDN) is awaited through `document.fonts.ready` before both first render and
export, since measuring before the font loads yields wrong widths.

## Alternatives considered

- **Template as a flag on `memes` (`isTemplate: true`).** Rejected: templates
  have no votes, no feed presence, and no visibility, so they would need most
  meme fields nulled/ignored and every meme query would have to exclude them. A
  separate thin table is cleaner and keeps the feed queries untouched.
- **A created meme as a first-class concept with stored editable layers and
  provenance (base image + text boxes + a link to the source Template).**
  Rejected: it would make the backend aware of the creator, block the "just an
  upload" simplicity, and commit us to versioned layer storage and migrations
  for a v1 that only needs a flat image. The cost is accepted below.
- **A discriminated-union `target` on `reports` (`{type, id}`).** Rejected in
  favour of two optional FK fields because the union would force a data
  migration of every existing report and a `targetType` backfill for zero
  functional gain.

## Consequences

- **No remix-from-meme.** Because the output is a flat image with no provenance,
  a published meme can't be reopened in the creator or traced to its base. This
  is an accepted v1 limitation.
- **Templates can never be ranked by usage.** Nothing records that a meme was
  made from a Template, so "most-used templates" is impossible without adding
  the provenance this ADR deliberately omits. The picker is newest-first only.
- **The upload pipeline stays the single publish path.** Any future change to
  meme validation, storage, or rate limiting applies to created memes for free,
  with no creator-specific branch to keep in sync.
- **Template lifecycle tracks meme lifecycle by reuse.** Delete/undo/reclaim,
  admin removal, and reporting behave identically to memes because they share
  the same helpers; a future change to the undo window or reclaim applies to
  both.
- **Parity is provable without a browser.** The only new unit-test seam is the
  pure layout module; drag/resize, canvas compositing, and clipboard glue are
  verified manually, matching the repo's existing "test external behavior only"
  stance.
