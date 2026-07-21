import { type JSX, Show, createSignal } from "solid-js";
import {
  type MemeMetadata,
  type MemeVisibility,
  parseTags,
} from "~/lib/upload";

/**
 * The shared title/tags/visibility publish form (#84). Extracted from the
 * upload page so the Meme Creator publishes a composed image through the exact
 * same metadata surface — the creator's output is a plain uploaded meme
 * (backend-blind, ADR 0019), so its publish form must be identical.
 *
 * Owns only the metadata fields; the caller owns the file/preview above it and
 * the actual publish action (`onPublish`) below it, plus `busy`/`error` state.
 * Extra fields — the creator's "save as template" opt-in — slot in through
 * `children`, rendered just above the submit button.
 */
export function MetadataForm(props: {
  submitLabel: string;
  busy: boolean;
  /** Disables submit when the caller isn't ready (e.g. no image yet). */
  disabled?: boolean;
  /** Server/network error from the caller's publish attempt. */
  error?: string | null;
  /** Replaces the submit label while `busy` (e.g. "Uploading… 40%"). */
  busyLabel?: string;
  children?: JSX.Element;
  onPublish: (meta: MemeMetadata) => void;
}) {
  const [title, setTitle] = createSignal("");
  const [tagsText, setTagsText] = createSignal("");
  const [visibility, setVisibility] = createSignal<MemeVisibility>("public");

  function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (props.busy || props.disabled) return;
    props.onPublish({
      title: title().trim() || undefined,
      tags: parseTags(tagsText()),
      visibility: visibility(),
    });
  }

  return (
    <form class="space-y-5" onSubmit={onSubmit}>
      <div>
        <label for="meme-title" class="mb-1 block text-sm text-[#5a5a6e]">
          Title <span class="text-[#5a5a6e]/60">(optional)</span>
        </label>
        <input
          id="meme-title"
          type="text"
          value={title()}
          disabled={props.busy}
          onInput={(e) => setTitle(e.currentTarget.value)}
          class="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#63e6be]/40"
        />
      </div>

      <div>
        <label for="meme-tags" class="mb-1 block text-sm text-[#5a5a6e]">
          Tags <span class="text-[#5a5a6e]/60">(comma-separated)</span>
        </label>
        <input
          id="meme-tags"
          type="text"
          value={tagsText()}
          disabled={props.busy}
          placeholder="cats, reaction, monday"
          onInput={(e) => setTagsText(e.currentTarget.value)}
          class="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[#5a5a6e]/50 focus:border-[#63e6be]/40"
        />
      </div>

      <div>
        <span class="mb-1 block text-sm text-[#5a5a6e]">Visibility</span>
        <div
          class="inline-flex rounded-xl border border-white/10 p-1"
          role="group"
          aria-label="Visibility"
        >
          <button
            type="button"
            aria-pressed={visibility() === "public"}
            disabled={props.busy}
            onClick={() => setVisibility("public")}
            class={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${
              visibility() === "public"
                ? "bg-[#63e6be]/10 text-[#63e6be]"
                : "text-[#5a5a6e]"
            }`}
          >
            Public
          </button>
          <button
            type="button"
            aria-pressed={visibility() === "private"}
            disabled={props.busy}
            onClick={() => setVisibility("private")}
            class={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${
              visibility() === "private"
                ? "bg-[#63e6be]/10 text-[#63e6be]"
                : "text-[#5a5a6e]"
            }`}
          >
            Private
          </button>
        </div>
      </div>

      {props.children}

      <Show when={props.error}>
        <p class="text-sm text-[#ff8787]">{props.error}</p>
      </Show>

      <button
        type="submit"
        disabled={props.busy || props.disabled}
        class="w-full rounded-xl border border-[#63e6be]/30 bg-[#63e6be]/10 px-4 py-2.5 text-sm font-bold text-[#63e6be] transition disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Show when={props.busy} fallback={<span>{props.submitLabel}</span>}>
          {props.busyLabel ?? "Publishing…"}
        </Show>
      </button>
    </form>
  );
}
