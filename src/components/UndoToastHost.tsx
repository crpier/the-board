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
  const restoreTemplate = useMutation(api.templates.restoreTemplate);
  const [error, setError] = createSignal<string | null>(null);

  const isRestoring = () =>
    restoreMeme.isLoading() || restoreTemplate.isLoading();

  // A new toast (different target) should start without a stale error from the
  // previous one.
  createEffect(
    on(
      () => {
        const t = undoToast();
        return t?.kind === "meme"
          ? t.memeId
          : t?.kind === "template"
            ? t.templateId
            : undefined;
      },
      () => setError(null),
    ),
  );

  async function onUndo() {
    const current = undoToast();
    if (!current || isRestoring()) return;
    setError(null);
    try {
      if (current.kind === "meme") {
        await restoreMeme.mutate({ memeId: current.memeId });
      } else {
        await restoreTemplate.mutate({ templateId: current.templateId });
      }
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
              disabled={isRestoring()}
              onClick={() => void onUndo()}
              class="text-sm font-bold text-[#63e6be] transition hover:text-[#63e6be]/80 disabled:opacity-50"
            >
              {isRestoring() ? "Restoring…" : "Undo"}
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
