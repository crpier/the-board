import { api } from "@convex/_generated/api";
import { createEffect, createSignal, on, Show } from "solid-js";
import { useMutation } from "~/lib/convex-solid";
import { dismissUndoToast, undoToast } from "~/lib/undo-toast";

/**
 * Renders the "meme deleted, undo?" toast (#71). Mounted once in `app.tsx`
 * above the router so it survives the navigation a delete from the meme
 * detail page triggers (`onDeleted` there sends the viewer back to `/`).
 *
 * Restoring here relies on `listPublicMemes`/`listProfileMemes` being live
 * queries: once `restoreMeme` flips the meme back to `ready`, any open feed
 * simply receives it again through its existing subscription — no local
 * "un-delete" bookkeeping needed on this end.
 */
export function UndoToastHost() {
  const restoreMeme = useMutation(api.memes.restoreMeme);
  const [error, setError] = createSignal<string | null>(null);

  // A new toast (different meme) should start without a stale error from the
  // previous one.
  createEffect(
    on(
      () => undoToast()?.memeId,
      () => setError(null),
    ),
  );

  async function onUndo() {
    const current = undoToast();
    if (!current || restoreMeme.isLoading()) return;
    setError(null);
    try {
      await restoreMeme.mutate({ memeId: current.memeId });
      dismissUndoToast();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    }
  }

  return (
    <Show when={undoToast()}>
      {(entry) => (
        <div class="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div
            role="status"
            class="flex max-w-sm flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-[#15151f] px-4 py-3 shadow-xl"
          >
            <p class="text-sm text-[#c7c7d6]">{error() ?? entry().message}</p>
            <button
              type="button"
              disabled={restoreMeme.isLoading()}
              onClick={() => void onUndo()}
              class="text-sm font-bold text-[#63e6be] transition hover:text-[#63e6be]/80 disabled:opacity-50"
            >
              {restoreMeme.isLoading() ? "Restoring…" : "Undo"}
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismissUndoToast()}
              class="text-sm text-[#5a5a6e] transition hover:text-[#8b8b9e]"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}
