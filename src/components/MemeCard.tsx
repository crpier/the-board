import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { FeedMeme } from "@convex/memes";
import { A } from "@solidjs/router";
import { For, Show, createSignal, untrack } from "solid-js";
import {
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from "date-fns";
import { VoteControl } from "~/components/VoteControl";
import { useAction, useMutation } from "~/lib/convex-solid";

type Meme = FeedMeme;
type Visibility = FeedMeme["visibility"];

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

/**
 * Structural split only (commas); canonicalization — trim, lowercase, de-dupe —
 * is the server's job (`canonicalizeTags`), matching the upload form.
 */
function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function MemeCard(props: {
  meme: Meme;
  /** Called after a successful delete so the parent can drop the card. */
  onDeleted?: (id: Id<"memes">) => void;
}) {
  const [editing, setEditing] = createSignal(false);
  const detailHref = () => `/meme/${props.meme._id}`;

  return (
    <article class="overflow-hidden rounded-2xl border border-white bg-gradient-to-b">
      {/* ── Title (when present) ── */}
      <Show when={props.meme.title}>
        {(title) => (
          <div class="px-4 pt-4 pb-2">
            <h2 class="font-display text-center text-lg font-bold text-white">
              <A
                href={detailHref()}
                class="transition-colors hover:text-[#63e6be]"
              >
                {title()}
              </A>
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
                // A tag is a search term: clicking it runs `/search?q=<tag>`.
                // The card is shared, so this makes tags clickable in the feed,
                // detail, and results at once; in results the URL `q` change
                // just re-runs the search. Author stays inert (profiles deferred).
                <A
                  href={`/search?q=${encodeURIComponent(tag)}`}
                  class="text-xs text-[#5a5a6e] transition-colors hover:text-[#63e6be]"
                >
                  #{tag}
                </A>
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

          {/* Owner-only edit/delete, gated on the server-computed flag */}
          <Show when={props.meme.isOwner}>
            <OwnerControls
              meme={props.meme}
              editing={editing()}
              onEdit={() => setEditing(true)}
              onDeleted={props.onDeleted}
            />
          </Show>

          {/* Author (inert) + time permalink — pushed to the right */}
          <span class="ml-auto text-[11px] text-[#6a6a7e]">
            @{props.meme.authorName} &middot;{" "}
            <A
              href={detailHref()}
              class="transition-colors hover:text-[#63e6be]"
            >
              {formatTimeAgo(props.meme._creationTime)}
            </A>
          </span>
        </div>

        {/* Inline edit form */}
        <Show when={props.meme.isOwner && editing()}>
          <EditForm meme={props.meme} onClose={() => setEditing(false)} />
        </Show>
      </div>
    </article>
  );
}

function OwnerControls(props: {
  meme: Meme;
  editing: boolean;
  onEdit: () => void;
  onDeleted?: (id: Id<"memes">) => void;
}) {
  const deleteMeme = useAction(api.memes.deleteMeme);
  const [error, setError] = createSignal<string | null>(null);

  async function onDelete() {
    if (deleteMeme.isLoading()) return;
    if (!confirm("Delete this meme? This can't be undone.")) return;
    setError(null);
    try {
      await deleteMeme.mutate({ memeId: props.meme._id });
      props.onDeleted?.(props.meme._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  return (
    <div class="flex items-center gap-2 text-[11px]">
      <button
        type="button"
        disabled={props.editing}
        onClick={() => props.onEdit()}
        class="text-[#6a6a7e] transition-colors hover:text-[#63e6be] disabled:opacity-50"
      >
        Edit
      </button>
      <button
        type="button"
        disabled={deleteMeme.isLoading()}
        onClick={() => void onDelete()}
        class="text-[#6a6a7e] transition-colors hover:text-[#ff8787] disabled:opacity-50"
      >
        {deleteMeme.isLoading() ? "Deleting…" : "Delete"}
      </button>
      <Show when={error()}>
        {(message) => <span class="text-[#ff8787]">{message()}</span>}
      </Show>
    </div>
  );
}

function EditForm(props: { meme: Meme; onClose: () => void }) {
  const updateMeme = useMutation(api.memes.updateMeme);

  // Seed the form once from the current meme; the form is an intentional
  // snapshot, so later prop changes shouldn't clobber in-progress edits, hence
  // the untracked reads.
  const [title, setTitle] = createSignal(untrack(() => props.meme.title ?? ""));
  const [tagsText, setTagsText] = createSignal(
    untrack(() => props.meme.tags.join(", ")),
  );
  const [visibility, setVisibility] = createSignal<Visibility>(
    untrack(() => props.meme.visibility),
  );
  const [error, setError] = createSignal<string | null>(null);

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (updateMeme.isLoading()) return;
    setError(null);
    try {
      await updateMeme.mutate({
        memeId: props.meme._id,
        title: title().trim() || undefined,
        tags: parseTags(tagsText()),
        visibility: visibility(),
      });
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <form
      class="space-y-3 rounded-xl border border-white/10 p-3"
      onSubmit={onSubmit}
    >
      <div>
        <label
          for={`edit-title-${props.meme._id}`}
          class="mb-1 block text-xs text-[#5a5a6e]"
        >
          Title <span class="text-[#5a5a6e]/60">(optional)</span>
        </label>
        <input
          id={`edit-title-${props.meme._id}`}
          type="text"
          value={title()}
          disabled={updateMeme.isLoading()}
          onInput={(e) => setTitle(e.currentTarget.value)}
          class="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#63e6be]/40"
        />
      </div>

      <div>
        <label
          for={`edit-tags-${props.meme._id}`}
          class="mb-1 block text-xs text-[#5a5a6e]"
        >
          Tags <span class="text-[#5a5a6e]/60">(comma-separated)</span>
        </label>
        <input
          id={`edit-tags-${props.meme._id}`}
          type="text"
          value={tagsText()}
          disabled={updateMeme.isLoading()}
          placeholder="cats, reaction, monday"
          onInput={(e) => setTagsText(e.currentTarget.value)}
          class="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[#5a5a6e]/50 focus:border-[#63e6be]/40"
        />
      </div>

      <div>
        <span class="mb-1 block text-xs text-[#5a5a6e]">Visibility</span>
        <div
          class="inline-flex rounded-lg border border-white/10 p-1"
          role="group"
          aria-label="Visibility"
        >
          <For each={["public", "private"] as const}>
            {(option) => (
              <button
                type="button"
                aria-pressed={visibility() === option}
                disabled={updateMeme.isLoading()}
                onClick={() => setVisibility(option)}
                class={`rounded-md px-3 py-1 text-xs font-bold capitalize transition ${
                  visibility() === option
                    ? "bg-[#63e6be]/10 text-[#63e6be]"
                    : "text-[#5a5a6e]"
                }`}
              >
                {option}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={error()}>
        {(message) => <p class="text-xs text-[#ff8787]">{message()}</p>}
      </Show>

      <div class="flex gap-2">
        <button
          type="submit"
          disabled={updateMeme.isLoading()}
          class="rounded-lg border border-[#63e6be]/30 bg-[#63e6be]/10 px-3 py-1.5 text-xs font-bold text-[#63e6be] transition disabled:opacity-50"
        >
          {updateMeme.isLoading() ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={updateMeme.isLoading()}
          onClick={() => props.onClose()}
          class="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-[#5a5a6e] transition disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
