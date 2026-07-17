import { api } from "@convex/_generated/api";
import { ACCEPTED_FILE_TYPES } from "@convex/media";
import { Title } from "@solidjs/meta";
import { Show, createSignal, onCleanup } from "solid-js";
import { useConvexAuth } from "~/lib/convex-auth-solid";
import { useAction, useMutation } from "~/lib/convex-solid";
import { friendlyErrorMessage } from "~/lib/errors";
import { type FileCheck, putToR2, validateFile } from "~/lib/upload";

type Visibility = "public" | "private";
type Phase = "idle" | "uploading" | "posted";

/**
 * Split a free-text tag field into raw tags. We only do the cheap structural
 * split here (commas) and leave canonicalization — trim, lowercase, de-dupe — to
 * the server (`canonicalizeTags`), so the client never has to mirror those rules.
 */
function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export default function Upload() {
  const auth = useConvexAuth()!;

  return (
    <main class="mx-auto max-w-2xl px-5 py-6">
      <Title>Upload</Title>
      <h1 class="mb-5 text-xl font-bold">Upload a meme</h1>
      <Show
        when={!auth.isLoading()}
        fallback={<p class="text-[#5a5a6e]">Checking auth…</p>}
      >
        <Show
          when={auth.isAuthenticated()}
          fallback={
            <div class="rounded-2xl border border-white/10 p-6 text-center">
              <p class="text-[#5a5a6e]">You need to sign in to upload.</p>
              <button
                class="mt-3 rounded-xl border border-[#63e6be]/30 bg-[#63e6be]/10 px-4 py-2 text-sm font-bold text-[#63e6be]"
                onClick={() => void auth.signIn()}
              >
                Sign in
              </button>
            </div>
          }
        >
          <UploadForm />
        </Show>
      </Show>
    </main>
  );
}

function UploadForm() {
  const generateUploadUrl = useMutation(api.r2.generateUploadUrl);
  const syncUploadedMetadata = useAction(api.r2.syncUploadedMetadata);
  const createMeme = useAction(api.memes.createMeme);

  const [file, setFile] = createSignal<File | null>(null);
  const [check, setCheck] = createSignal<FileCheck | null>(null);
  const [previewUrl, setPreviewUrl] = createSignal<string | null>(null);

  const [title, setTitle] = createSignal("");
  const [tagsText, setTagsText] = createSignal("");
  const [visibility, setVisibility] = createSignal<Visibility>("public");

  const [phase, setPhase] = createSignal<Phase>("idle");
  const [progress, setProgress] = createSignal(0);
  const [error, setError] = createSignal<string | null>(null);

  // Revoke the object URL whenever it's replaced or the component unmounts so
  // selecting several files in a row doesn't leak blobs.
  function setPreview(url: string | null) {
    const prev = previewUrl();
    if (prev) URL.revokeObjectURL(prev);
    setPreviewUrl(url);
  }
  onCleanup(() => setPreview(null));

  function onPick(picked: File | undefined) {
    setError(null);
    if (!picked) {
      setFile(null);
      setCheck(null);
      setPreview(null);
      return;
    }
    const result = validateFile(picked);
    setFile(picked);
    setCheck(result);
    setPreview(result.ok ? URL.createObjectURL(picked) : null);
  }

  const canSubmit = () =>
    phase() === "idle" && file() !== null && check()?.ok === true;

  // Narrowed views of the union so JSX doesn't have to re-narrow `check()` (each
  // call returns the union afresh, defeating control-flow narrowing).
  const mediaType = () => {
    const c = check();
    return c?.ok ? c.mediaType : null;
  };
  const checkError = () => {
    const c = check();
    return c && !c.ok ? c.error : null;
  };

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    const picked = file();
    if (!picked || check()?.ok !== true) return;

    setPhase("uploading");
    setProgress(0);
    setError(null);
    try {
      const { url, key } = await generateUploadUrl.mutate({});
      await putToR2(url, picked, setProgress);
      await syncUploadedMetadata.mutate({ key });
      await createMeme.mutate({
        key,
        title: title().trim() || undefined,
        tags: parseTags(tagsText()),
        visibility: visibility(),
      });
      setPhase("posted");
    } catch (err) {
      setError(friendlyErrorMessage(err, "Upload failed."));
      setPhase("idle");
    }
  }

  function reset() {
    setPreview(null);
    setFile(null);
    setCheck(null);
    setTitle("");
    setTagsText("");
    setVisibility("public");
    setProgress(0);
    setError(null);
    setPhase("idle");
  }

  return (
    <Show
      when={phase() !== "posted"}
      fallback={
        <div class="rounded-2xl border border-[#63e6be]/30 bg-[#63e6be]/5 p-6 text-center">
          <p class="font-bold text-[#63e6be]">Posted!</p>
          <p class="mt-1 text-sm text-[#5a5a6e]">
            Your meme is live in the feed.
          </p>
          <div class="mt-4 flex justify-center gap-3">
            <a
              href="/"
              class="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold"
            >
              View feed
            </a>
            <button
              type="button"
              class="rounded-xl border border-[#63e6be]/30 bg-[#63e6be]/10 px-4 py-2 text-sm font-bold text-[#63e6be]"
              onClick={reset}
            >
              Upload another
            </button>
          </div>
        </div>
      }
    >
      <form class="space-y-5" onSubmit={onSubmit}>
        {/* File picker + preview */}
        <div>
          <label
            for="meme-file"
            class="block cursor-pointer rounded-2xl border border-dashed border-white/15 p-6 text-center transition hover:border-[#63e6be]/40"
          >
            <Show
              when={file()}
              fallback={
                <span class="text-[#5a5a6e]">
                  Click to pick an image, GIF, or video
                </span>
              }
            >
              {(f) => (
                <span class="block max-w-full text-sm break-words">
                  {f().name}{" "}
                  <span class="text-[#5a5a6e]">
                    ({(f().size / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                </span>
              )}
            </Show>
          </label>
          <input
            id="meme-file"
            type="file"
            accept={ACCEPTED_FILE_TYPES}
            class="sr-only"
            disabled={phase() === "uploading"}
            onChange={(e) => onPick(e.currentTarget.files?.[0])}
          />

          {/* Inline validation error from the client gate */}
          <Show when={checkError()}>
            {(message) => (
              <p class="mt-2 text-sm text-[#ff8787]">{message()}</p>
            )}
          </Show>

          {/* Preview of a valid pick */}
          <Show when={mediaType() && previewUrl()}>
            {(src) => (
              <div class="mt-3 overflow-hidden rounded-xl border border-white/10">
                <Show
                  when={mediaType() === "video"}
                  fallback={
                    <img
                      src={src()}
                      alt=""
                      class="max-h-80 w-full object-contain"
                    />
                  }
                >
                  <video src={src()} class="max-h-80 w-full" controls />
                </Show>
              </div>
            )}
          </Show>
        </div>

        {/* Title */}
        <div>
          <label for="meme-title" class="mb-1 block text-sm text-[#5a5a6e]">
            Title <span class="text-[#5a5a6e]/60">(optional)</span>
          </label>
          <input
            id="meme-title"
            type="text"
            value={title()}
            disabled={phase() === "uploading"}
            onInput={(e) => setTitle(e.currentTarget.value)}
            class="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#63e6be]/40"
          />
        </div>

        {/* Tags */}
        <div>
          <label for="meme-tags" class="mb-1 block text-sm text-[#5a5a6e]">
            Tags <span class="text-[#5a5a6e]/60">(comma-separated)</span>
          </label>
          <input
            id="meme-tags"
            type="text"
            value={tagsText()}
            disabled={phase() === "uploading"}
            placeholder="cats, reaction, monday"
            onInput={(e) => setTagsText(e.currentTarget.value)}
            class="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[#5a5a6e]/50 focus:border-[#63e6be]/40"
          />
        </div>

        {/* Visibility toggle */}
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
              disabled={phase() === "uploading"}
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
              disabled={phase() === "uploading"}
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

        {/* Server / network error */}
        <Show when={error()}>
          <p class="text-sm text-[#ff8787]">{error()}</p>
        </Show>

        {/* Submit + progress */}
        <button
          type="submit"
          disabled={!canSubmit()}
          class="w-full rounded-xl border border-[#63e6be]/30 bg-[#63e6be]/10 px-4 py-2.5 text-sm font-bold text-[#63e6be] transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Show when={phase() === "uploading"} fallback={<span>Publish</span>}>
            Uploading… {Math.round(progress() * 100)}%
          </Show>
        </button>
      </form>
    </Show>
  );
}
