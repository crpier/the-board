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
    <nav class="flex items-center justify-between p-4">
      <a href="/" class="font-bold tracking-tight">
        the-board
      </a>
      <div class="flex items-center gap-3">
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
            <Show when={viewer.data()}>
              {(user) => (
                <div class="flex items-center gap-2">
                  <Show
                    when={user().avatarUrl}
                    fallback={
                      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a2a3e] text-sm uppercase">
                        {user().displayName.charAt(0)}
                      </div>
                    }
                  >
                    {(avatarUrl) => (
                      <img
                        src={avatarUrl()}
                        alt=""
                        class="h-8 w-8 rounded-full"
                      />
                    )}
                  </Show>
                  <span class="text-sm">{user().displayName}</span>
                </div>
              )}
            </Show>
            <button onClick={() => void auth.signOut()}>Sign out</button>
          </Show>
        </Show>
      </div>
    </nav>
  );
}
