import { A, useNavigate } from "@solidjs/router";
import { Show, createSignal } from "solid-js";
import { api } from "@convex/_generated/api";
import { useConvexAuth } from "~/lib/convex-auth-solid";
import { useConvexClient, useQuery } from "~/lib/convex-solid";

export default function Navbar() {
  const auth = useConvexAuth()!;
  const client = useConvexClient();
  const navigate = useNavigate();
  // Only subscribe once authenticated; signed-out viewers get `null` anyway.
  const viewer = useQuery(api.viewer.current, {}, () => ({
    enabled: auth.isAuthenticated(),
  }));

  const [randomLoading, setRandomLoading] = createSignal(false);
  const [randomError, setRandomError] = createSignal<string | null>(null);

  // "Random" (#66): a one-off query call, not a subscription — `useQuery`
  // exists to keep a view live, which a single click-to-navigate doesn't need.
  // `Math.random()` is generated client-side and passed as `seed`; the query
  // itself stays a pure function of its args (Convex guideline), while a fresh
  // seed each click is what makes repeated clicks land on different memes.
  async function goToRandomMeme() {
    if (client === undefined || randomLoading()) return;
    setRandomLoading(true);
    setRandomError(null);
    try {
      const memeId = await client.query(api.memes.getRandomMeme, {
        seed: Math.random(),
      });
      if (memeId === null) {
        setRandomError("No public memes yet.");
        return;
      }
      navigate(`/meme/${memeId}`);
    } catch {
      setRandomError("Couldn't load a random meme.");
    } finally {
      setRandomLoading(false);
    }
  }

  return (
    <nav class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3 sm:p-4">
      <a href="/" class="font-bold tracking-tight">
        the-board
      </a>
      <div class="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
        {/* Plain link to the search page — not an inline live search box.
            Search is open to everyone, so it sits outside the auth gate. */}
        <A href="/search" class="text-sm text-[#5a5a6e] hover:text-[#63e6be]">
          Search
        </A>
        {/* Random discovery (#66) — also open to everyone, same as Search. */}
        <button
          type="button"
          onClick={() => void goToRandomMeme()}
          disabled={randomLoading()}
          class="text-sm text-[#5a5a6e] hover:text-[#63e6be] disabled:opacity-50"
        >
          {randomLoading() ? "Random…" : "Random"}
        </button>
        <Show when={randomError()}>
          {(message) => (
            <span role="status" class="text-xs text-[#ff8787]">
              {message()}
            </span>
          )}
        </Show>
        <Show
          when={!auth.isLoading()}
          fallback={<span class="text-sm text-[#5a5a6e]">Checking auth…</span>}
        >
          <Show
            when={auth.isAuthenticated()}
            fallback={
              <button onClick={() => void auth.signIn()}>Sign in</button>
            }
          >
            <a
              href="/upload"
              class="rounded-xl border border-[#63e6be]/30 bg-[#63e6be]/10 px-3 py-1.5 text-sm font-bold text-[#63e6be]"
            >
              Upload
            </a>
            <Show when={viewer.data()}>
              {(user) => (
                // The avatar + name doubles as the entry point to profile
                // settings — no separate nav item needed.
                <A
                  href="/settings"
                  class="flex min-w-0 items-center gap-2 transition-colors hover:text-[#63e6be]"
                  title="Settings"
                >
                  <Show
                    when={user().avatarUrl}
                    fallback={
                      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2a2a3e] text-sm uppercase">
                        {user().displayName.charAt(0)}
                      </div>
                    }
                  >
                    {(avatarUrl) => (
                      <img
                        src={avatarUrl()}
                        alt=""
                        class="h-8 w-8 shrink-0 rounded-full"
                      />
                    )}
                  </Show>
                  <span class="max-w-[8rem] truncate text-sm sm:max-w-[12rem]">
                    {user().displayName}
                  </span>
                </A>
              )}
            </Show>
            <button onClick={() => void auth.signOut()}>Sign out</button>
          </Show>
        </Show>
      </div>
    </nav>
  );
}
