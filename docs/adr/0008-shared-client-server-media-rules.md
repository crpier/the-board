# ADR 0008 - Shared Client/Server Media-Acceptance Rules

Date: 2026-06-29
Status: accepted

## Context

The upload UI (#30) validates a picked file before requesting a presigned URL so
the user gets instant feedback on an unsupported type or an oversized file,
instead of discovering it only after a wasted upload + publish round trip. The
server already enforces those same rules authoritatively in `createMeme` (ADR
0007): it derives `mediaType` from the real R2 object content-type and re-checks
the byte ceiling.

That creates two copies of the same rules — the accepted MIME-to-`mediaType`
mapping (with `image/gif` matched before the generic `image/` prefix) and the
per-type size ceilings (image 10 MB / GIF 25 MB / video 100 MB). If the client
copy drifts from the server copy, the UI either rejects files the server would
accept or, worse, accepts files the server will reject after the upload.

## Decision

Put the rules in one backend-free module, `convex/media.ts`, exporting
`MEDIA_LIMITS`, `MEGABYTE`, the `MediaType` type, and `classifyMedia`. Both sides
import it:

- `convex/memes.ts` (`createMeme`) uses it for server-authoritative validation.
- `src/lib/upload.ts` (`validateFile`) uses it for the pre-upload client gate,
  applied to the browser `File`'s `type` and `size`.

The module imports only `convex/values` types and the existing
`mediaTypeValidator`, so it carries no server-only dependencies and is safe to
bundle into the browser. This follows the same single-source-of-truth pattern the
repo already uses for `convex/validators.ts`.

Server authority is unchanged: the client gate is an optimization, not a trust
boundary. The server still re-derives the type and re-checks the size against the
real object (ADR 0007), so a tampered or stale client cannot publish an invalid
meme.

## Considered alternatives

- **Duplicate the constants in the client.** Simplest, no shared import, but the
  two copies drift silently — exactly the failure this slice would introduce.
- **Expose the rules from a Convex query.** Avoids a shared import but adds a
  network round trip to validate a local file pick, defeating the "instant
  feedback" goal, and still needs a client copy of the comparison logic.

## Consequences

- Changing a media limit or accepted type is a one-line edit in `convex/media.ts`
  that both surfaces pick up; neither can be updated without the other.
- `src/` now imports from `convex/` (via the `@convex/*` path alias), as it
  already does for `FeedMeme`. Anything imported into the client from `convex/`
  must stay backend-free; `convex/media.ts` is written to that constraint.
