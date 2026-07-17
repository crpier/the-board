import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { api } from "@convex/_generated/api";
import { useConvexAuth } from "~/lib/convex-auth-solid";
import { useQuery } from "~/lib/convex-solid";

export default function Navbar() {
  const auth = useConvexAuth()!;
  // Only subscribe once authenticated; signed-out viewers get `null` anyway.
  const viewer = useQuery(api.viewer.current, {}, () => ({
    enabled: auth.isAuthenticated(),
  }));

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
