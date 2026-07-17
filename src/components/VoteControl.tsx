import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticUpdate } from "convex/browser";
import { ArrowBigDown, ArrowBigUp } from "lucide-solid";
import { useConvexAuth } from "~/lib/convex-auth-solid";
import { useMutation, useQuery } from "~/lib/convex-solid";

type VoteValue = "up" | "down";
type CastVoteArgs = { memeId: Id<"memes">; value: VoteValue };

/**
 * Optimistically patch `cardState` so the highlight and the count move together
 * the instant a vote is clicked. The transition mirrors `castVote`'s server-side
 * toggle (ADR 0004): re-clicking your vote clears it, the opposite flips it, none
 * creates it. Convex rolls this back automatically once the mutation settles.
 *
 * Only the per-card subscription is patched, so page-2+ cards (loaded via
 * non-reactive one-shot queries) still get optimistic feedback through their
 * live `cardState` subscription.
 */
const optimisticCastVote: OptimisticUpdate<CastVoteArgs> = (
  localStore,
  { memeId, value },
) => {
  const current = localStore.getQuery(api.votes.cardState, { memeId });
  // `undefined` = not yet subscribed; `null` = meme no longer visible. Either
  // way there is nothing to patch — let the server be the authority.
  if (current === undefined || current === null) return;

  let { upvoteCount, downvoteCount } = current;
  let myVote: VoteValue | null;

  if (current.myVote === value) {
    myVote = null;
    if (value === "up") upvoteCount -= 1;
    else downvoteCount -= 1;
  } else if (current.myVote === null) {
    myVote = value;
    if (value === "up") upvoteCount += 1;
    else downvoteCount += 1;
  } else {
    myVote = value;
    if (value === "up") {
      upvoteCount += 1;
      downvoteCount -= 1;
    } else {
      upvoteCount -= 1;
      downvoteCount += 1;
    }
  }

  localStore.setQuery(
    api.votes.cardState,
    { memeId },
    { upvoteCount, downvoteCount, myVote },
  );
};

/**
 * Self-contained vote control: reads `votes.cardState` for live counts + the
 * viewer's own vote, renders highlighted up/down buttons, and casts votes with
 * an optimistic update. Reused by the meme detail page.
 *
 * `initialUpvoteCount` / `initialDownvoteCount` are the feed item's denormalized
 * counts, shown only for the first paint until `cardState` resolves (ADR 0004).
 *
 * Signed-out: buttons render visibly disabled with counts still shown and a
 * "Sign in to vote" tooltip; interaction sends no vote.
 */
export function VoteControl(props: {
  memeId: Id<"memes">;
  initialUpvoteCount: number;
  initialDownvoteCount: number;
}) {
  const auth = useConvexAuth()!;
  const state = useQuery(api.votes.cardState, () => ({ memeId: props.memeId }));
  const castVote = useMutation(api.votes.castVote, optimisticCastVote);

  // `cardState` is the source of truth once it resolves; fall back to the feed
  // item's counts for the first paint (and if the meme is later hidden -> null).
  const counts = () =>
    state.data() ?? {
      upvoteCount: props.initialUpvoteCount,
      downvoteCount: props.initialDownvoteCount,
      myVote: null as VoteValue | null,
    };

  const vote = (value: VoteValue) => {
    if (!auth.isAuthenticated()) return;
    void castVote.mutate({ memeId: props.memeId, value }).catch(() => {
      // Optimistic update self-reverts on failure; nothing to do here.
    });
  };

  const enabled = () => auth.isAuthenticated();

  const buttonClass = (active: boolean, activeColor: string) => {
    // min-h-11 (44px) meets the Apple HIG / Android tap-target minimum
    // regardless of icon/text metrics — the row-level padding alone was a
    // couple px short of that at the default text-sm line-height.
    const base =
      "flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition";
    const disabled = enabled()
      ? "cursor-pointer"
      : "cursor-not-allowed opacity-50";
    const tone = active
      ? activeColor
      : "border-white/[0.06] text-[#5a5a6e]" +
        (enabled() ? " hover:border-white/20" : "");
    return `${base} ${tone} ${disabled}`;
  };

  return (
    <div class="flex items-center gap-2" role="group" aria-label="Vote">
      <button
        type="button"
        aria-pressed={counts().myVote === "up"}
        aria-disabled={!enabled()}
        title={enabled() ? "Upvote" : "Sign in to vote"}
        class={buttonClass(
          counts().myVote === "up",
          "border-[#63e6be]/20 bg-[#63e6be]/10 text-[#63e6be]",
        )}
        onClick={() => vote("up")}
      >
        <ArrowBigUp class="h-4 w-4" />
        {counts().upvoteCount}
      </button>

      <button
        type="button"
        aria-pressed={counts().myVote === "down"}
        aria-disabled={!enabled()}
        title={enabled() ? "Downvote" : "Sign in to vote"}
        class={buttonClass(
          counts().myVote === "down",
          "border-[#ff8787]/20 bg-[#ff8787]/10 text-[#ff8787]",
        )}
        onClick={() => vote("down")}
      >
        <ArrowBigDown class="h-4 w-4" />
        {counts().downvoteCount}
      </button>
    </div>
  );
}
