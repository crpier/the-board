import { isRateLimitError } from "@convex-dev/rate-limiter";

/**
 * Render `retryAfter` (milliseconds, from the rate limiter's `RateLimitError`)
 * as a short human-friendly duration. Convex rate limits here are on the
 * order of seconds to an hour (#69), so this only needs to read well across
 * that range — it rounds up so "try again" never undersells the wait.
 */
function formatRetryAfter(retryAfterMs: number): string {
  const seconds = Math.ceil(retryAfterMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  return `${hours}h`;
}

/**
 * Turn a caught mutation/action error into a message safe to show a user.
 *
 * Every call site in this app already follows the same shape — a local
 * `error` signal set from a `catch` block and rendered inline (see
 * `MemeCard.tsx`, `upload.tsx`) — so this is the one place that knows how to
 * recognize a rate-limit rejection (`ConvexError` with
 * `data.kind === "RateLimited"`, thrown by `rateLimiter.limit(..., { throws:
 * true })` in `convex/rateLimiter.ts`) and phrase it distinctly from a plain
 * `Error`, rather than surfacing the raw exception.
 *
 * `fallback` covers the non-`Error` case (e.g. a thrown string), matching
 * what each call site used to inline before this helper existed.
 */
export function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (isRateLimitError(err)) {
    return `Slow down — try again in ${formatRetryAfter(err.data.retryAfter)}.`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
}
