import type { FeedMeme } from "@convex/memes";
import { For, Show } from "solid-js";
import {
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from "date-fns";
import { VoteControl } from "~/components/VoteControl";

type Meme = FeedMeme;

function formatTimeAgo(creationTime: number): string {
  const date = new Date(creationTime);
  const minutes = differenceInMinutes(new Date(), date);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = differenceInHours(new Date(), date);
  if (hours < 24) return `${hours}h ago`;

  const days = differenceInDays(new Date(), date);
  return `${days}d ago`;
}

export function MemeCard(props: { meme: Meme }) {
  return (
    <article class="overflow-hidden rounded-2xl border border-white bg-gradient-to-b">
      {/* ── Title (when present) ── */}
      <Show when={props.meme.title}>
        {(title) => (
          <div class="px-4 pt-4 pb-2">
            <h2 class="font-display text-center text-lg font-bold text-white">
              {title()}
            </h2>
          </div>
        )}
      </Show>

      {/* ── Media ── */}
      <Show
        when={props.meme.mediaType !== "video"}
        fallback={
          <video
            class="w-full bg-black"
            controls
            preload="metadata"
            src={props.meme.mediaUrl}
          />
        }
      >
        <img
          class="w-full"
          src={props.meme.mediaUrl}
          alt={props.meme.title ?? "Meme"}
        />
      </Show>

      {/* ── Footer ── */}
      <div class="space-y-2 px-4 pt-2.5 pb-3">
        {/* Tags */}
        <Show when={props.meme.tags.length > 0}>
          <div class="flex flex-wrap gap-x-2 gap-y-1">
            <For each={props.meme.tags}>
              {(tag) => (
                <span class="cursor-pointer text-xs text-[#5a5a6e] transition-colors hover:text-[#63e6be]">
                  #{tag}
                </span>
              )}
            </For>
          </div>
        </Show>

        {/* Actions + meta row */}
        <div class="flex items-center gap-3">
          <VoteControl
            memeId={props.meme._id}
            initialUpvoteCount={props.meme.upvoteCount}
            initialDownvoteCount={props.meme.downvoteCount}
          />

          {/* Author + time — pushed to the right */}
          <span class="ml-auto cursor-pointer text-[11px] text-[#6a6a7e]">
            @{props.meme.authorName} &middot;{" "}
            {formatTimeAgo(props.meme._creationTime)}
          </span>
        </div>
      </div>
    </article>
  );
}
