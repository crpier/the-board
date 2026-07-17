import { Show } from "solid-js";
import { Portal } from "solid-js/web";

/**
 * Small, in-app confirmation modal (#71) replacing the blocking browser
 * `confirm()` previously used for delete. Generic on purpose — any
 * destructive/irreversible action can reuse it, not just delete.
 *
 * Accessibility is intentionally minimal rather than a full focus-trap
 * implementation (no dialog/modal library exists in this codebase yet, ADR
 * discussion deferred to #71's PR): the confirm button gets initial focus,
 * `Escape` and a backdrop click both cancel, and the panel carries
 * `role="alertdialog"` + `aria-modal` + labelling so a screen reader
 * announces it correctly. A native `<dialog>` with `showModal()` would trap
 * focus for free, but SolidStart's SSR-less client render made the plain
 * `Portal` approach simpler to reason about here.
 */
export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (red) instead of the default accent. */
  danger?: boolean;
  /** Disables both buttons while the confirmed action is in flight. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" && !props.busy) {
      props.onCancel();
    }
  }

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !props.busy) {
              props.onCancel();
            }
          }}
          onKeyDown={onKeyDown}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby={
              props.description ? "confirm-dialog-description" : undefined
            }
            class="w-full max-w-sm rounded-2xl border border-white/10 bg-[#15151f] p-5 shadow-xl"
          >
            <h2
              id="confirm-dialog-title"
              class="font-display text-lg font-bold text-white"
            >
              {props.title}
            </h2>
            <Show when={props.description}>
              {(description) => (
                <p
                  id="confirm-dialog-description"
                  class="mt-2 text-sm text-[#8b8b9e]"
                >
                  {description()}
                </p>
              )}
            </Show>
            <div class="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={props.busy}
                onClick={() => props.onCancel()}
                class="rounded-lg border border-white/10 px-3 py-1.5 text-sm font-bold text-[#8b8b9e] transition disabled:opacity-50"
              >
                {props.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                // `<Show>` only mounts this button once `open` is true, so the
                // ref fires exactly once per open — focus it right then rather
                // than tracking it through a signal.
                ref={(el) => el.focus()}
                disabled={props.busy}
                onClick={() => props.onConfirm()}
                class={`rounded-lg border px-3 py-1.5 text-sm font-bold transition disabled:opacity-50 ${
                  props.danger
                    ? "border-[#ff8787]/30 bg-[#ff8787]/10 text-[#ff8787]"
                    : "border-[#63e6be]/30 bg-[#63e6be]/10 text-[#63e6be]"
                }`}
              >
                {props.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
