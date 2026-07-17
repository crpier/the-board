import { HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";

import { components } from "./_generated/api";

/**
 * Per-user mutation rate limits (#69). Every limit is keyed by the acting
 * user's id (`key: userId`), so limits are per-account, never global or
 * per-IP — an authenticated user hammering an endpoint from many sessions
 * still shares one bucket.
 *
 * All three use the "token bucket" strategy rather than "fixed window": it
 * lets a user burst up to `capacity` (useful for e.g. quickly upvoting a few
 * memes in a row) while still capping sustained throughput at `rate` per
 * `period`. Capacity defaults to `rate` when omitted, so each bucket starts
 * full and refills continuously rather than resetting all-at-once on a
 * calendar boundary (which "fixed window" would do, and which is a worse fit
 * for a UI users interact with continuously).
 *
 * Values are deliberately generous for a normal human clicking around, and
 * restrictive against a scripted hammer:
 *   - `uploadMeme`: 10/hour. Uploads involve an R2 transfer and a DB write;
 *     10/hour comfortably covers a real posting session while bounding
 *     storage-abuse and spam potential.
 *   - `castVote`: 60/minute. Voting is the highest-frequency action (every
 *     card click), so the budget is generous, but 1/sec sustained is still
 *     far beyond how fast a person can deliberately click.
 *   - `updateMeme`: 30/hour. Edits are infrequent relative to uploads/votes;
 *     this leaves room for a user revising a post a few times without
 *     enabling edit-spam (e.g. churning search/tag indexing).
 *
 * See docs/adr/0013-rate-limiting.md for the record of this choice.
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  uploadMeme: { kind: "token bucket", rate: 10, period: HOUR },
  castVote: { kind: "token bucket", rate: 60, period: MINUTE },
  updateMeme: { kind: "token bucket", rate: 30, period: HOUR },
});
