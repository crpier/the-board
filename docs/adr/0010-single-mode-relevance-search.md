# ADR 0010 - Single-Mode Relevance Search with Denormalized `searchText`

Date: 2026-06-29
Status: accepted

## Context

Discovery has been browse-only: a reverse-chronological feed and a detail page,
with tags rendered but inert. The product doc has always promised search over a
meme's text metadata with media-type and tag filtering. As the library grows
toward a planned large import, browse-only discovery stops scaling.

A Convex `searchIndex` requires a **non-empty search string** — there is no
"return everything ordered by recency" mode on a search index. That constraint
forces an architectural choice between two shapes:

- **Dual-mode:** relevance search when there's query text, and a separate
  recency-ordered browse when only a facet (e.g. a media type) is selected. This
  needs a second index, a mode boundary, and its own tests for the facet-only
  path.
- **Single-mode:** one search index; every query carries text, and facets are
  refinements on top of it. "Show all videos, no query" simply has no path.

The matching field also needs deciding. Convex full-text search matches one
`searchField`, so the title and tags a user might type must be folded into a
single string. The author is a separate question: a meme's `authorName` is
resolved live from `users.name` (ADR 0006) and is deliberately never
denormalized onto the meme, precisely to avoid rename staleness.

## Decision

Search is **single-mode relevance** over a **denormalized `searchText`** field.

- Exactly one `searchIndex` (`search_searchText`) backs the feature.
  `searchField` is `searchText`; `filterFields` are `visibility`, `status`, and
  `mediaType`. There is no recency/browse query path.
- `searchText` is an `optional` string on `memes`, equal to the title plus the
  canonicalized tags joined by spaces. **The author is excluded** — folding
  `authorName` in would reintroduce the rename staleness ADR 0006 exists to
  prevent. A shared `buildSearchText(title, tags)` helper computes it on every
  write that touches title/tags (the create-lifecycle insert and the owner
  edit), mirroring how `canonicalizeTags` is shared. The seed path inherits it
  through the same lifecycle mutation.
- `searchText` stays `optional` permanently. A schema push validates every
  existing document, so a required field can't be added before a backfill
  exists, and the backfill can't run before the field exists — `optional` breaks
  that chicken-and-egg, and a missing value simply never matches (correct
  degradation). The index tolerates absence, so a second tightening migration
  isn't worth it.
- The `searchMemes` query pins `visibility = public` and `status = ready` for
  **every** viewer. The filter is static and viewer-independent: an owner's own
  private memes never surface, and there is no per-viewer branch that could leak
  a private meme's existence. `mediaType` is applied only when a type is given.
  Empty/whitespace query text returns an empty page rather than running an empty
  search. All narrowing is index-driven — no `.filter()`.
- A bounded, idempotent internal `backfillSearchText` mutation paginates `memes`
  (never `collect()`) and populates `searchText` on rows that predate the field,
  run once post-deploy.

## Consequences

- Tag "browsing" is relevance-ordered and prefix-fuzzy, not chronological or
  strict-equality faceting. Typing a tag word finds memes carrying that tag,
  ranked by match quality — good enough for discovery, and the single-mode
  collapse removes a whole index, query path, and test matrix.
- Standalone media-type browse ("all videos, no query") has no path in this
  design; the type control is a refinement on an active search. Deferred.
- `searchText` is internal plumbing: it is computed on write and never enters
  the feed view-model returned to clients (ADR 0006 still governs the read
  shape).
- Search reflects current metadata immediately because every title/tags write
  recomputes `searchText`; only truly pre-field rows depend on the backfill.
