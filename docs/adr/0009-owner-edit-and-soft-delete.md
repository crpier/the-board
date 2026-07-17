# ADR 0009 - Owner Edit and Soft-Delete with R2 Reclamation

Date: 2026-06-29
Status: accepted (delete's R2-reclaim timing superseded by
[ADR 0013](0013-delayed-r2-reclaim-and-delete-undo-window.md))

## Context

Authenticated users can manage their own memes: edit metadata and delete
(`docs/product-overview.md`, Ownership). Two questions are durable and
cross-cutting enough to record:

- **Authorization.** Who may edit or delete a meme, and where is that decided?
- **Delete semantics.** Is delete a hard row removal or a soft tombstone, what
  happens to the R2 object, and what happens to vote rows?

The publish path already established the relevant shapes: `createMeme` is an
**action** because it commits a database change and then reclaims an orphaned R2
object as a separate committed step (ADR-0007), and reads return a resolved
view-model that never leaks raw foreign keys (ADR-0006).

## Decision

**Authorization keys off `authorId === getAuthUserId(ctx)`, server-side.** No
caller-supplied user id is ever trusted. A shared `requireOwnedMeme` helper is
the single gate for both edit and delete: it throws an opaque "not found" for a
missing, already-deleted, or someone-else's meme so a non-owner cannot probe a
meme's existence, and "you can only manage your own memes" only when ownership
genuinely fails.

**Edit (`updateMeme`, a mutation):** owner-only edit of `title`, `tags`, and
`visibility`. The media item is immutable here — there is **no media swap**.
Tags run through the same `canonicalizeTags` path as `createMeme`, so edited and
freshly published tags normalize identically. A blank `title` clears the field,
matching publish.

**Delete (`deleteMeme`, an action) is a soft tombstone:** it flips the meme to
`status = "deleted"` and reclaims the R2 object. It is an action for the same
reason `createMeme` is — it commits a row change and then touches R2. Ordering is
deliberate: the tombstone (carrying the ownership check, inside the transaction)
commits **first**, then the object is deleted. A failed object delete therefore
leaves an orphaned object (reclaimable later) rather than a still-visible meme.
**Vote rows are left in place.** There is **no restore UI**; a delayed-reclaim
undo window is future work.

**Ownership is surfaced to the client as a computed flag.** The meme view-model
gains a viewer-relative `isOwner: boolean` (and carries `visibility`, which the
edit form prefills) so the client can gate owner-only controls without the raw
`authorId` ever crossing the API boundary — an extension of ADR-0006, not a
departure from it.

## Consequences

- Hiding a meme is immediate and cheap: the public read filters
  (`visibility = "public"`, `status = "ready"`) already exclude `deleted`, so no
  read path needs a new guard.
- A delete that fails mid-way degrades safely toward an orphaned object, never a
  zombie meme. Orphan sweeping is a separate concern, unblocked by this slice.
- Keeping vote rows means a future restore could recover counts, and avoids an
  unbounded cascade delete inside the request. Aggregate counts on a tombstoned
  meme are simply never read.
- `isOwner` makes the meme query viewer-relative: it now reads the identity even
  for the public feed. The cost is one `getAuthUserId` per query (not per meme).
