import { api } from "@convex/_generated/api";
import { MAX_DISPLAY_NAME_LENGTH } from "@convex/viewer";
import { Title } from "@solidjs/meta";
import { Show, createSignal, untrack } from "solid-js";
import { useConvexAuth } from "~/lib/convex-auth-solid";
import { useMutation, useQuery } from "~/lib/convex-solid";

export default function Settings() {
  const auth = useConvexAuth()!;

  return (
    <main class="mx-auto max-w-2xl px-5 py-6">
      <Title>Settings</Title>
      <h1 class="mb-5 text-xl font-bold">Settings</h1>
      <Show
        when={!auth.isLoading()}
        fallback={<p class="text-[#5a5a6e]">Checking auth…</p>}
      >
        <Show
          when={auth.isAuthenticated()}
          fallback={
            <div class="rounded-2xl border border-white/10 p-6 text-center">
              <p class="text-[#5a5a6e]">
                You need to sign in to edit your profile.
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
          <ProfileSection />
        </Show>
      </Show>
    </main>
  );
}

function ProfileSection() {
  const viewer = useQuery(api.viewer.current, {});

  return (
    <Show
      when={viewer.data()}
      fallback={<p class="text-[#5a5a6e]">Loading profile…</p>}
    >
      {(user) => <DisplayNameForm current={user().displayName} />}
    </Show>
  );
}

function DisplayNameForm(props: { current: string }) {
  const updateDisplayName = useMutation(api.viewer.updateDisplayName);

  // Seed once from the current profile; the form is an intentional snapshot,
  // so later query updates shouldn't clobber in-progress edits, hence the
  // untracked read (same pattern as MemeCard's EditForm).
  const [name, setName] = createSignal(untrack(() => props.current));
  const [error, setError] = createSignal<string | null>(null);
  const [saved, setSaved] = createSignal(false);

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (updateDisplayName.isLoading()) return;
    setError(null);
    setSaved(false);
    try {
      await updateDisplayName.mutate({ displayName: name() });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <form class="space-y-4" onSubmit={onSubmit}>
      <div>
        <label for="display-name" class="mb-1 block text-sm text-[#5a5a6e]">
          Display name
        </label>
        <input
          id="display-name"
          type="text"
          value={name()}
          maxlength={MAX_DISPLAY_NAME_LENGTH}
          disabled={updateDisplayName.isLoading()}
          onInput={(e) => {
            setName(e.currentTarget.value);
            setSaved(false);
          }}
          class="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#63e6be]/40"
        />
        <p class="mt-1 text-xs text-[#5a5a6e]">
          Shown on your memes everywhere. Clear the field to go back to your
          Google account name.
        </p>
      </div>

      <Show when={error()}>
        {(message) => <p class="text-sm text-[#ff8787]">{message()}</p>}
      </Show>

      <div class="flex items-center gap-3">
        <button
          type="submit"
          disabled={updateDisplayName.isLoading()}
          class="rounded-xl border border-[#63e6be]/30 bg-[#63e6be]/10 px-4 py-2 text-sm font-bold text-[#63e6be] transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {updateDisplayName.isLoading() ? "Saving…" : "Save"}
        </button>
        <Show when={saved()}>
          <span class="text-sm text-[#63e6be]">Saved</span>
        </Show>
      </div>
    </form>
  );
}
