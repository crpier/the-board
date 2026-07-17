import type { Id } from "@convex/_generated/dataModel";
import { createSignal } from "solid-js";

/**
 * Global "meme deleted, undo?" toast state (#71, ADR 0013). Module-level
 * singleton rather than a context provider: there is exactly one toast slot
 * for the whole app (a second delete just replaces it) and nothing about it
 * is scoped to a subtree, unlike `ConvexProvider`/`ConvexAuthProvider` which
 * carry an injected client. `UndoToastHost` (mounted once in `app.tsx`, above
 * the router) is the sole reader; `MemeCard` is the sole writer.
 */
type UndoToastState = { memeId: Id<"memes">; message: string } | null;

const [undoToast, setUndoToast] = createSignal<UndoToastState>(null);
export { undoToast };

const TOAST_DURATION_MS = 8000;
let dismissTimer: ReturnType<typeof setTimeout> | undefined;

/** Show the undo toast for a just-deleted meme, auto-dismissing after a few seconds. */
export function showUndoToast(memeId: Id<"memes">, title?: string) {
  clearTimeout(dismissTimer);
  setUndoToast({
    memeId,
    message: title ? `Deleted "${title}".` : "Meme deleted.",
  });
  dismissTimer = setTimeout(() => setUndoToast(null), TOAST_DURATION_MS);
}

export function dismissUndoToast() {
  clearTimeout(dismissTimer);
  setUndoToast(null);
}
