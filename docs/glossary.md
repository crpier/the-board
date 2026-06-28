# Glossary

Shared domain terms for `the-board`. Keep definitions short and aligned with
`product-overview.md`; record the reasoning behind a term in an ADR when it is
load-bearing.

## Meme

A public media post with one primary media item (image, GIF, or video) and
optional title, description, and tags. Has a separate **visibility** (who can see
it) and **lifecycle status** (draft, processing, ready, failed, deleted). Public
browsing shows only memes that are both `public` and `ready`.

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
