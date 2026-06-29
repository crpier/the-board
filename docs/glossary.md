# Glossary

Shared domain terms for `the-board`. Keep definitions short and aligned with
`product-overview.md`; record the reasoning behind a term in an ADR when it is
load-bearing.

## Meme

A public media post with one primary media item (image, GIF, or video), an
optional title, and tags. Has a separate **visibility** (who can see it) and
**lifecycle status** (draft, processing, ready, failed, deleted). Public browsing
shows only memes that are both `public` and `ready`.

## Feed meme (view-model)

The resolved read shape a meme query returns to the client, never the raw
`Doc<"memes">`. Foreign keys are resolved server-side: `authorId` becomes a live
`authorName` read from `users.name` (so a profile rename shows everywhere with no
backfill), and the stored R2 `mediaKey` becomes a CDN `mediaUrl`. Raw foreign
keys never leave the query (see ADR 0006). It also carries an `isOwner` flag
(computed from `authorId === getAuthUserId`, so the raw author id stays server-side
while the client can gate owner-only edit/delete controls) and the meme's
`visibility` (which the owner's edit form prefills).

## Tombstone (delete)

Deleting a meme is a soft delete: its lifecycle `status` is flipped to `deleted`
(which hides it everywhere — public reads only show `public` + `ready`) and its R2
object is reclaimed, while vote rows are left in place. Owner-only, authorized by
`authorId === getAuthUserId`. There is no restore UI (see ADR 0009).

## Tags

Short labels attached to a meme for discovery. **Canonicalized** on write —
lowercased, trimmed, whitespace-collapsed, and de-duplicated — so the same idea
maps to a single tag and tags are reusable across memes. Stored as a string array
on the meme for now; a shared tag table (clickable tag pages, autocomplete) is
deferred to the discovery work.

## searchText (search blob)

The denormalized, internal full-text field on a meme: its title plus its
canonicalized tags joined by spaces. **The author is excluded** — `authorName`
is resolved live (see _Feed meme_) and folding it in would reintroduce rename
staleness. Recomputed on every write that touches title/tags via a shared
`buildSearchText` helper, so search always reflects current metadata. It is the
`searchField` of the one search index and never enters the view-model returned
to clients (see ADR 0010).

## Relevance search

The single discovery query (`searchMemes`): one Convex search index ranks
`public` + `ready` memes by how well their `searchText` matches the query, for
every viewer alike. There is no recency/browse query path — a query always
carries text, and media type is an optional refinement, not a standalone browse
axis. Empty/whitespace text yields an empty page. Tag matching is therefore
relevance-ordered and prefix-fuzzy, not chronological or strict-equality
faceting (see ADR 0010).

## Vote

A user's single active stance on a meme: an upvote or a downvote. A user holds at
most one active vote per meme. Stored as one row per `(user, meme)`; "no vote" is
the absence of a row. Voting requires authentication.

## Active vote

The vote a user currently holds on a meme (`up`, `down`, or none). "Active"
distinguishes the present stance from any notion of vote history — the system
keeps no history, so clearing a vote deletes it.

## Toggle (voting)

The server-side rule for `castVote`: choosing the direction you already hold
clears your vote, choosing the opposite flips it, and choosing one when you hold
none creates it. The server decides the transition from committed state, not the
client.

## Vote counts

The aggregate `upvoteCount` and `downvoteCount` shown on feed and detail
surfaces. Stored denormalized on the meme and updated transactionally by
`castVote`.

## Card state

The per-card view-model for a meme in the feed: `{ upvoteCount, downvoteCount,
myVote }`, served by a single reactive per-card query so counts and the viewer's
own vote update together (`myVote` is `null` for guests).
