import { Show } from "solid-js";
import { useConvexAuth } from "~/lib/convex-auth-solid";

export default function Navbar() {
  const auth = useConvexAuth()!;

  return (
    <div class="flex justify-end gap-3 p-4">
      <Show when={!auth.isLoading()} fallback={<span>Checking auth...</span>}>
        <Show
          when={auth.isAuthenticated()}
          fallback={<button onClick={() => void auth.signIn()}>Sign in</button>}
        >
          <button onClick={() => void auth.signOut()}>Sign out</button>
        </Show>
      </Show>
    </div>
  );
}
