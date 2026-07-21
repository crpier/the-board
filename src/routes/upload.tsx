import { ACCEPTED_FILE_TYPES } from "@convex/media";
import { Title } from "@solidjs/meta";
import { Show, createSignal, onCleanup } from "solid-js";
import { MetadataForm } from "~/components/MetadataForm";
import { useConvexAuth } from "~/lib/convex-auth-solid";
import { useConvexClient } from "~/lib/convex-solid";
import { friendlyErrorMessage } from "~/lib/errors";
import {
  type FileCheck,
  type MemeMetadata,
  publishMeme,
  validateFile,
} from "~/lib/upload";

type Phase = "idle" | "uploading" | "posted";

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
  const client = useConvexClient();

  const [file, setFile] = createSignal<File | null>(null);
  const [check, setCheck] = createSignal<FileCheck | null>(null);
  const [previewUrl, setPreviewUrl] = createSignal<string | null>(null);

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

  // Narrowed views of the union so JSX doesn't have to re-narrow `check()`.
  const mediaType = () => {
    const c = check();
    return c?.ok ? c.mediaType : null;
  };
  const checkError = () => {
    const c = check();
    return c && !c.ok ? c.error : null;
  };

  async function onPublish(meta: MemeMetadata) {
    const picked = file();
    if (!picked || check()?.ok !== true) return;

    setPhase("uploading");
    setProgress(0);
    setError(null);
    try {
      if (!client) throw new Error("Not connected.");
      await publishMeme(client, picked, meta, setProgress);
      setPhase("posted");
    } catch (err) {
      setError(friendlyErrorMessage(err, "Upload failed."));
      setPhase("idle");
    }
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
          </div>
        </div>
      }
    >
      <div class="space-y-5">
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

          <Show when={checkError()}>
            {(message) => (
              <p class="mt-2 text-sm text-[#ff8787]">{message()}</p>
            )}
          </Show>

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

        <MetadataForm
          submitLabel="Publish"
          busy={phase() === "uploading"}
          busyLabel={`Uploading… ${Math.round(progress() * 100)}%`}
          disabled={file() === null || check()?.ok !== true}
          error={error()}
          onPublish={(meta) => void onPublish(meta)}
        />
      </div>
    </Show>
  );
}
