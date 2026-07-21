import "@fontsource/anton";

import { api } from "@convex/_generated/api";
import { Title } from "@solidjs/meta";
import { useSearchParams } from "@solidjs/router";
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { MetadataForm } from "~/components/MetadataForm";
import { TemplatePicker } from "~/components/TemplatePicker";
import { useConvexAuth } from "~/lib/convex-auth-solid";
import { useConvexClient, useQuery } from "~/lib/convex-solid";
import { friendlyErrorMessage } from "~/lib/errors";
import {
  MEME_FONT_FAMILY,
  type TextBox,
  canvasToBlob,
  ensureMemeFontReady,
  layoutBox,
  renderMeme,
} from "~/lib/meme-export";
import {
  type MemeMetadata,
  publishMeme,
  uploadFileToR2,
  validateFile,
} from "~/lib/upload";

// Published output is re-encoded to JPEG to keep sizes sane; the clipboard copy
// stays PNG (the Clipboard API only accepts image/png for images).
const EXPORT_MIME = "image/jpeg";
const EXPORT_QUALITY = 0.9;

type Base =
  | { source: "local"; file: File; url: string; name: string }
  | { source: "template"; url: string; name: string };

let boxSeq = 0;

export default function Create() {
  const auth = useConvexAuth()!;
  return (
    <main class="mx-auto max-w-3xl px-5 py-6">
      <Title>Create a meme</Title>
      <h1 class="mb-5 text-xl font-bold">Meme creator</h1>
      <Show
        when={!auth.isLoading()}
        fallback={<p class="text-[#5a5a6e]">Checking auth…</p>}
      >
        <Show
          when={auth.isAuthenticated()}
          fallback={
            <div class="rounded-2xl border border-white/10 p-6 text-center">
              <p class="text-[#5a5a6e]">
                You need to sign in to create a meme.
              </p>
              <button
                class="mt-3 rounded-xl border border-[#63e6be]/30 bg-[#63e6be]/10 px-4 py-2 text-sm font-bold text-[#63e6be]"
                onClick={() => void auth.signIn()}
              >
                Sign in
              </button>
            </div>
          }
        >
          <Creator />
        </Show>
      </Show>
    </main>
  );
}

function Creator() {
  const client = useConvexClient();
  const [searchParams] = useSearchParams();

  const [base, setBase] = createSignal<Base | null>(null);
  const [boxes, setBoxes] = createSignal<TextBox[]>([]);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [pickError, setPickError] = createSignal<string | null>(null);
  const [fontReady, setFontReady] = createSignal(false);

  // Natural image dimensions, set on load; drive the natural-px coordinate space.
  const [natural, setNatural] = createSignal<{ w: number; h: number } | null>(
    null,
  );
  let imgEl: HTMLImageElement | undefined;

  onMount(() => {
    void ensureMemeFontReady().then(() => setFontReady(true));
  });

  // Launch from the template picker via /create?template=<id>.
  const templateParam = createMemo(() => {
    const t = searchParams.template;
    return typeof t === "string" ? t : undefined;
  });
  const preloadedTemplate = useQuery(
    api.templates.getTemplate,
    () => ({ id: templateParam() ?? "" }),
    () => ({ enabled: (templateParam() ?? "").length > 0 }),
  );
  createEffect(() => {
    const t = preloadedTemplate.data();
    if (t && base() === null) {
      setBase({ source: "template", url: t.mediaUrl, name: t.name });
    }
  });

  function revokeLocal() {
    const b = base();
    if (b?.source === "local") URL.revokeObjectURL(b.url);
  }
  onCleanup(revokeLocal);

  function pickLocalFile(file: File | undefined) {
    setPickError(null);
    if (!file) return;
    // Reject GIF/video explicitly — the canvas would silently freeze the first
    // frame otherwise (spec). `validateFile` returns "image" only for a static
    // image (GIFs classify as "gif").
    const check = validateFile(file);
    if (!check.ok || check.mediaType !== "image") {
      setPickError(
        "Pick a static image — GIFs and videos can't be captioned in the creator.",
      );
      return;
    }
    revokeLocal();
    setBoxes([]);
    setSelectedId(null);
    setNatural(null);
    setBase({
      source: "local",
      file,
      url: URL.createObjectURL(file),
      name: file.name,
    });
  }

  function onImageLoad() {
    if (imgEl) setNatural({ w: imgEl.naturalWidth, h: imgEl.naturalHeight });
  }

  // Screen px per natural px, for mapping pointer deltas into image space.
  function scale(): number {
    const nat = natural();
    if (!imgEl || !nat || nat.w === 0) return 1;
    return imgEl.clientWidth / nat.w;
  }

  function addBox() {
    const nat = natural();
    if (!nat) return;
    const width = Math.round(nat.w * 0.7);
    const box: TextBox = {
      id: `box-${boxSeq++}`,
      text: "TEXT",
      xPx: Math.round((nat.w - width) / 2),
      yPx: Math.round(nat.h * 0.06),
      widthPx: width,
      fontSizePx: Math.max(16, Math.round(nat.h * 0.09)),
    };
    setBoxes((b) => [...b, box]);
    setSelectedId(box.id);
  }

  function updateBox(id: string, patch: Partial<TextBox>) {
    setBoxes((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function removeBox(id: string) {
    setBoxes((bs) => bs.filter((b) => b.id !== id));
    if (selectedId() === id) setSelectedId(null);
  }

  const selectedBox = createMemo(
    () => boxes().find((b) => b.id === selectedId()) ?? null,
  );

  // ---- Drag & resize (pointer events) --------------------------------------
  type Gesture =
    | {
        kind: "move";
        id: string;
        startX: number;
        startY: number;
        boxX: number;
        boxY: number;
      }
    | {
        kind: "resize";
        id: string;
        startX: number;
        startWidth: number;
        startFont: number;
      };
  let gesture: Gesture | null = null;

  function onPointerMove(e: PointerEvent) {
    if (!gesture) return;
    const s = scale();
    const nat = natural();
    if (!nat) return;
    if (gesture.kind === "move") {
      const dx = (e.clientX - gesture.startX) / s;
      const dy = (e.clientY - gesture.startY) / s;
      const box = boxes().find((b) => b.id === gesture!.id);
      if (!box) return;
      const x = clamp(gesture.boxX + dx, 0, nat.w - box.widthPx);
      const y = clamp(gesture.boxY + dy, 0, nat.h - box.fontSizePx);
      updateBox(gesture.id, { xPx: Math.round(x), yPx: Math.round(y) });
    } else {
      const dx = (e.clientX - gesture.startX) / s;
      const newWidth = clamp(gesture.startWidth + dx, nat.w * 0.1, nat.w);
      const ratio = newWidth / gesture.startWidth;
      const newFont = clamp(gesture.startFont * ratio, 8, nat.h);
      updateBox(gesture.id, {
        widthPx: Math.round(newWidth),
        fontSizePx: Math.round(newFont),
      });
    }
  }

  function endGesture(e: PointerEvent) {
    gesture = null;
    (e.currentTarget as Element | null)?.releasePointerCapture?.(e.pointerId);
  }

  function startMove(e: PointerEvent, box: TextBox) {
    e.preventDefault();
    setSelectedId(box.id);
    gesture = {
      kind: "move",
      id: box.id,
      startX: e.clientX,
      startY: e.clientY,
      boxX: box.xPx,
      boxY: box.yPx,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function startResize(e: PointerEvent, box: TextBox) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(box.id);
    gesture = {
      kind: "resize",
      id: box.id,
      startX: e.clientX,
      startWidth: box.widthPx,
      startFont: box.fontSizePx,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  // ---- Export / render -----------------------------------------------------
  function renderToCanvas(): HTMLCanvasElement | null {
    if (!imgEl || !natural()) return null;
    const canvas = document.createElement("canvas");
    renderMeme(canvas, imgEl, boxes());
    return canvas;
  }

  // ---- Copy image (PNG, must originate in the click handler for Safari) ----
  const [copyState, setCopyState] = createSignal<"idle" | "copied" | "error">(
    "idle",
  );
  function onCopy() {
    setCopyState("idle");
    try {
      // Build the ClipboardItem synchronously with a Blob *promise* so the
      // write stays inside the user gesture (Safari requirement).
      const blobPromise = (async () => {
        await ensureMemeFontReady();
        const canvas = renderToCanvas();
        if (!canvas) throw new Error("Nothing to copy yet.");
        return canvasToBlob(canvas, "image/png");
      })();
      void navigator.clipboard
        .write([new ClipboardItem({ "image/png": blobPromise })])
        .then(() => setCopyState("copied"))
        .catch(() => setCopyState("error"));
    } catch {
      setCopyState("error");
    }
  }

  // ---- Publish -------------------------------------------------------------
  const [publishing, setPublishing] = createSignal(false);
  const [saveAsTemplate, setSaveAsTemplate] = createSignal(false);
  const [templateName, setTemplateName] = createSignal("");
  const [memeOutcome, setMemeOutcome] = createSignal<"ok" | string | null>(
    null,
  );
  const [templateOutcome, setTemplateOutcome] = createSignal<
    "ok" | string | null
  >(null);
  const [showPublish, setShowPublish] = createSignal(false);

  const canSaveTemplate = () => base()?.source === "local";
  const templateNameMissing = () =>
    saveAsTemplate() && templateName().trim().length === 0;

  async function onPublish(meta: MemeMetadata) {
    if (!client) return;
    setPublishing(true);
    setMemeOutcome(null);
    setTemplateOutcome(null);

    // Meme half — always runs.
    try {
      await ensureMemeFontReady();
      const canvas = renderToCanvas();
      if (!canvas) throw new Error("Add your image first.");
      const blob = await canvasToBlob(canvas, EXPORT_MIME, EXPORT_QUALITY);
      const file = new File([blob], "meme.jpg", { type: EXPORT_MIME });
      await publishMeme(client, file, meta);
      setMemeOutcome("ok");
    } catch (err) {
      setMemeOutcome(friendlyErrorMessage(err, "Publishing the meme failed."));
    }

    // Template half — independent outcome, only for local-file bases.
    const b = base();
    if (saveAsTemplate() && b?.source === "local") {
      try {
        const key = await uploadFileToR2(client, b.file);
        await client.action(api.templates.createTemplate, {
          key,
          name: templateName().trim(),
        });
        setTemplateOutcome("ok");
      } catch (err) {
        setTemplateOutcome(
          friendlyErrorMessage(err, "Saving the template failed."),
        );
      }
    }

    setPublishing(false);
  }

  const publishDone = () =>
    memeOutcome() !== null &&
    (!saveAsTemplate() || !canSaveTemplate() || templateOutcome() !== null);

  return (
    <div class="space-y-5">
      <Switch>
        {/* Step 1: choose a base image. */}
        <Match when={base() === null}>
          <BaseChooser
            onPickFile={pickLocalFile}
            onPickTemplate={(t) =>
              setBase({ source: "template", url: t.mediaUrl, name: t.name })
            }
            error={pickError()}
          />
        </Match>

        {/* Step 3: publish outcome. */}
        <Match when={showPublish() && publishDone()}>
          <PublishOutcome
            meme={memeOutcome()}
            template={
              saveAsTemplate() && canSaveTemplate() ? templateOutcome() : null
            }
          />
        </Match>

        {/* Step 2: edit + publish. */}
        <Match when={true}>
          <div class="space-y-4">
            <div class="relative mx-auto w-full overflow-hidden rounded-xl border border-white/10 select-none">
              <img
                ref={(el) => (imgEl = el)}
                src={base()!.url}
                alt=""
                onLoad={onImageLoad}
                class="block w-full"
                crossOrigin="anonymous"
                draggable={false}
              />
              {/* Text-box overlays, positioned in scaled natural px. */}
              <For each={boxes()}>
                {(box) => (
                  <OverlayBox
                    box={box}
                    scale={scale()}
                    selected={selectedId() === box.id}
                    onPointerDown={(e) => startMove(e, box)}
                    onPointerMove={onPointerMove}
                    onPointerUp={endGesture}
                    onResizeStart={(e) => startResize(e, box)}
                  />
                )}
              </For>
            </div>

            <Show
              when={fontReady()}
              fallback={<p class="text-xs text-[#5a5a6e]">Loading font…</p>}
            >
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addBox}
                  disabled={natural() === null}
                  class="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-bold disabled:opacity-50"
                >
                  + Add text
                </button>
                <button
                  type="button"
                  onClick={onCopy}
                  class="rounded-xl border border-white/10 px-3 py-1.5 text-sm font-bold"
                >
                  {copyState() === "copied"
                    ? "Copied!"
                    : copyState() === "error"
                      ? "Copy failed"
                      : "Copy image"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    revokeLocal();
                    setBase(null);
                    setBoxes([]);
                    setShowPublish(false);
                  }}
                  class="rounded-xl border border-white/10 px-3 py-1.5 text-sm text-[#5a5a6e]"
                >
                  Change image
                </button>
              </div>
            </Show>

            {/* Selected-box text editor. */}
            <Show when={selectedBox()}>
              {(box) => (
                <div class="space-y-2 rounded-xl border border-white/10 p-3">
                  <div class="flex items-center justify-between">
                    <span class="text-sm text-[#5a5a6e]">Caption text</span>
                    <button
                      type="button"
                      onClick={() => removeBox(box().id)}
                      class="text-xs text-[#ff8787]"
                    >
                      Remove box
                    </button>
                  </div>
                  <textarea
                    value={box().text}
                    onInput={(e) =>
                      updateBox(box().id, { text: e.currentTarget.value })
                    }
                    rows={2}
                    class="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-[#63e6be]/40"
                  />
                  <p class="text-xs text-[#5a5a6e]">
                    Drag the box to move it; drag its corner to resize.
                  </p>
                </div>
              )}
            </Show>

            {/* Publish panel. */}
            <div class="rounded-xl border border-white/10 p-4">
              <Show
                when={showPublish()}
                fallback={
                  <button
                    type="button"
                    onClick={() => setShowPublish(true)}
                    class="w-full rounded-xl border border-[#63e6be]/30 bg-[#63e6be]/10 px-4 py-2.5 text-sm font-bold text-[#63e6be]"
                  >
                    Continue to publish
                  </button>
                }
              >
                <MetadataForm
                  submitLabel="Publish to the board"
                  busy={publishing()}
                  disabled={templateNameMissing()}
                  onPublish={(meta) => void onPublish(meta)}
                >
                  <Show when={canSaveTemplate()}>
                    <div class="space-y-2 rounded-lg border border-white/10 p-3">
                      <label class="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={saveAsTemplate()}
                          disabled={publishing()}
                          onChange={(e) =>
                            setSaveAsTemplate(e.currentTarget.checked)
                          }
                        />
                        Save this image as a public template
                      </label>
                      <Show when={saveAsTemplate()}>
                        <input
                          type="text"
                          value={templateName()}
                          disabled={publishing()}
                          placeholder="Template name (required)"
                          onInput={(e) =>
                            setTemplateName(e.currentTarget.value)
                          }
                          class="w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-sm outline-none focus:border-[#63e6be]/40"
                        />
                      </Show>
                    </div>
                  </Show>
                </MetadataForm>
              </Show>
            </div>
          </div>
        </Match>
      </Switch>
    </div>
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function BaseChooser(props: {
  onPickFile: (file: File | undefined) => void;
  onPickTemplate: (t: { mediaUrl: string; name: string }) => void;
  error: string | null;
}) {
  return (
    <div class="space-y-6">
      <div>
        <label
          for="create-file"
          class="block cursor-pointer rounded-2xl border border-dashed border-white/15 p-6 text-center transition hover:border-[#63e6be]/40"
        >
          <span class="text-[#5a5a6e]">
            Upload your own image to caption (static images only)
          </span>
        </label>
        <input
          id="create-file"
          type="file"
          accept="image/*"
          class="sr-only"
          onChange={(e) => props.onPickFile(e.currentTarget.files?.[0])}
        />
        <Show when={props.error}>
          <p class="mt-2 text-sm text-[#ff8787]">{props.error}</p>
        </Show>
      </div>

      <div>
        <h2 class="mb-3 text-sm font-bold text-[#5a5a6e]">
          …or pick a template
        </h2>
        <TemplatePicker onSelect={props.onPickTemplate} />
      </div>
    </div>
  );
}

function OverlayBox(props: {
  box: TextBox;
  scale: number;
  selected: boolean;
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onResizeStart: (e: PointerEvent) => void;
}) {
  const layout = createMemo(() => layoutBox(props.box));
  const fontPx = () => props.box.fontSizePx * props.scale;
  return (
    <div
      class="absolute touch-none"
      classList={{ "outline outline-2 outline-[#63e6be]/70": props.selected }}
      style={{
        left: `${props.box.xPx * props.scale}px`,
        top: `${props.box.yPx * props.scale}px`,
        width: `${props.box.widthPx * props.scale}px`,
        "font-family": MEME_FONT_FAMILY,
        "font-size": `${fontPx()}px`,
        "line-height": "1.15",
        "text-align": "center",
        color: "#fff",
        "-webkit-text-stroke": `${fontPx() / 8}px #000`,
        cursor: "move",
      }}
      onPointerDown={(e) => props.onPointerDown(e)}
      onPointerMove={(e) => props.onPointerMove(e)}
      onPointerUp={(e) => props.onPointerUp(e)}
    >
      <For each={layout().lines}>
        {(line) => (
          <div style={{ "white-space": "pre" }}>{line.text || " "}</div>
        )}
      </For>
      <div
        class="absolute -right-1.5 -bottom-1.5 h-4 w-4 rounded-sm border border-black bg-[#63e6be]"
        style={{ cursor: "nwse-resize" }}
        onPointerDown={(e) => props.onResizeStart(e)}
        onPointerMove={(e) => props.onPointerMove(e)}
        onPointerUp={(e) => props.onPointerUp(e)}
      />
    </div>
  );
}

function PublishOutcome(props: {
  meme: "ok" | string | null;
  template: "ok" | string | null;
}) {
  return (
    <div class="space-y-3 rounded-2xl border border-white/10 p-6">
      <div>
        <p class="text-sm font-bold">Meme</p>
        <Show
          when={props.meme === "ok"}
          fallback={<p class="text-sm text-[#ff8787]">{props.meme}</p>}
        >
          <p class="text-sm text-[#63e6be]">Published to the board.</p>
        </Show>
      </div>
      <Show when={props.template !== null}>
        <div>
          <p class="text-sm font-bold">Template</p>
          <Show
            when={props.template === "ok"}
            fallback={<p class="text-sm text-[#ff8787]">{props.template}</p>}
          >
            <p class="text-sm text-[#63e6be]">Saved to the library.</p>
          </Show>
        </div>
      </Show>
      <a
        href="/"
        class="inline-block rounded-xl border border-white/10 px-4 py-2 text-sm font-bold"
      >
        View feed
      </a>
    </div>
  );
}
