import type { Id } from "@convex/_generated/dataModel";
import { createSignal } from "solid-js";

/**
 * Global "deleted, undo?" toast state (#71, ADR 0013). Module-level singleton
 * rather than a context provider: there is exactly one toast slot for the whole
 * app (a second delete just replaces it) and nothing about it is scoped to a
 * subtree. `UndoToastHost` (mounted once in `app.tsx`, above the router) is the
 * sole reader.
 *
 * The target is a discriminated union so the same toast covers memes (#71) and
 * templates (#84): both share the identical soft-delete + undo mechanic, only
 * the restore mutation differs, which `UndoToastHost` switches on.
 */
type UndoTarget =
  | { kind: "meme"; memeId: Id<"memes"> }
  | { kind: "template"; templateId: Id<"templates"> };

type UndoToastState = (UndoTarget & { message: string }) | null;

const [undoToast, setUndoToast] = createSignal<UndoToastState>(null);
export { undoToast };

const TOAST_DURATION_MS = 8000;
let dismissTimer: ReturnType<typeof setTimeout> | undefined;

/** Show the undo toast for a just-deleted meme, auto-dismissing after a few seconds. */
export function showUndoToast(memeId: Id<"memes">, title?: string) {
  clearTimeout(dismissTimer);
  setUndoToast({
    kind: "meme",
    memeId,
    message: title ? `Deleted "${title}".` : "Meme deleted.",
  });
  dismissTimer = setTimeout(() => setUndoToast(null), TOAST_DURATION_MS);
}

/** Show the undo toast for a just-deleted template (#84). */
export function showTemplateUndoToast(
  templateId: Id<"templates">,
  name?: string,
) {
  clearTimeout(dismissTimer);
  setUndoToast({
    kind: "template",
    templateId,
    message: name ? `Deleted template "${name}".` : "Template deleted.",
  });
  dismissTimer = setTimeout(() => setUndoToast(null), TOAST_DURATION_MS);
}

export function dismissUndoToast() {
  clearTimeout(dismissTimer);
  setUndoToast(null);
}
