import type { Doc } from "@convex/_generated/dataModel";
import {
  ArrowBigDown,
  ArrowBigUp,
  Bookmark,
  MessageCircle,
  Share2,
} from "lucide-solid";
import { For, Show } from "solid-js";

type Meme = Doc<"memes">;

/** Placeholder — you'll replace this with real relative-time logic. */
function formatTimeAgo(_creationTime: number): string {
  return "just now";
}

/** Placeholder — you'll replace this with real vote handling. */
function handleUpvote(_memeId: Meme["_id"]) {}
function handleDownvote(_memeId: Meme["_id"]) {}

export function MemeCard(props: { meme: Meme }) {
  return (
    <article class="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-[rgba(30,30,40,0.9)] to-[rgba(18,18,24,0.95)] transition-shadow duration-200 hover:shadow-[0_0_20px_rgba(99,230,190,0.05)]">
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
          {/* Upvote */}
          <button
            class="flex cursor-pointer items-center gap-1 text-xs text-[#63e6be] transition-opacity hover:opacity-80"
            onClick={() => handleUpvote(props.meme._id)}
          >
            <ArrowBigUp class="h-3.5 w-3.5" />
            {props.meme.upvoteCount}
          </button>

          {/* Downvote */}
          <button
            class="cursor-pointer text-[#8b8b9e] transition-opacity hover:opacity-80"
            onClick={() => handleDownvote(props.meme._id)}
          >
            <ArrowBigDown class="h-3.5 w-3.5" />
          </button>

          {/* Comment — placeholder */}
          <button class="flex cursor-pointer items-center gap-1 text-xs text-[#8b8b9e] transition-opacity hover:opacity-80">
            <MessageCircle class="h-3.5 w-3.5" />
            {/* TODO: wire real comment count */}0
          </button>

          {/* Share — placeholder */}
          <button class="cursor-pointer text-[#8b8b9e] transition-opacity hover:opacity-80">
            <Share2 class="h-3.5 w-3.5" />
          </button>

          {/* Bookmark — placeholder */}
          <button class="cursor-pointer text-[#8b8b9e] transition-opacity hover:opacity-80">
            <Bookmark class="h-3.5 w-3.5" />
          </button>

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
