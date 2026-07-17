import { api } from "@convex/_generated/api";
import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { HttpStatusCode } from "@solidjs/start";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { ReportsQueue } from "~/components/admin/ReportsQueue";
import { useConvexAuth } from "~/lib/convex-auth-solid";
import { useQuery } from "~/lib/convex-solid";

/**
 * Admin console entry point (`/admin`, #67). This reverses ADR 0012's "no
 * separate admin console" stance now that a review queue needs somewhere to
 * live — see ADR 0013.
 *
 * Gated on `viewer.current().isAdmin`, the same flag `MemeCard` already reads
 * to show `canModerate` (ADR 0012): a client-side UX gate only. Every admin
 * query/mutation this page calls (`reports.listOpenReports`,
 * `reports.resolveReport`) independently re-derives admin status server-side
 * and throws the same opaque "Not found." a non-admin would get anywhere
 * else, so this gate is convenience, not the actual security boundary.
 *
 * Built as tabs (currently just "Reports") so a future review-item type —
 * #58's duplicate findings, #59's AI-moderation restores — can add a sibling
 * tab here without reworking this shell. A parallel branch is separately
 * adding admin user management; this page stays scoped to the reports queue
 * and leaves room for that to land as another tab.
 */
type AdminTab = "reports";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "reports", label: "Reports" },
];

export default function Admin() {
  const auth = useConvexAuth()!;
  const viewer = useQuery(api.viewer.current, {}, () => ({
    enabled: auth.isAuthenticated(),
  }));
  const [tab, setTab] = createSignal<AdminTab>("reports");

  const isAdmin = () => viewer.data()?.isAdmin === true;
  const stillChecking = () =>
    auth.isLoading() || (auth.isAuthenticated() && viewer.data() === undefined);

  return (
    <main class="mx-auto max-w-3xl space-y-5 px-5 py-6">
      <Switch>
        <Match when={stillChecking()}>
          <Title>Admin · The Board</Title>
          <p class="text-[#5a5a6e]">Loading...</p>
        </Match>

        {/* Same not-found treatment as a hidden/deleted meme (see `/meme/:id`
            and `/profile/:id`) rather than a distinguishable "forbidden" —
            consistent with the rest of the app's opaque-denial convention. */}
        <Match when={!auth.isAuthenticated() || !isAdmin()}>
          <Title>Not found · The Board</Title>
          <HttpStatusCode code={404} />
          <div class="rounded-2xl border border-white/10 p-6 text-center">
            <p class="text-[#5a5a6e]">This page doesn&apos;t exist.</p>
            <A
              href="/"
              class="mt-3 inline-block text-sm text-[#63e6be] transition-colors hover:text-[#63e6be]/80"
            >
              Back to the feed
            </A>
          </div>
        </Match>

        <Match when={true}>
          <Title>Admin · The Board</Title>
          <header>
            <p class="text-xs tracking-[0.3em] text-[#5a5a6e] uppercase">
              Admin
            </p>
            <h1 class="font-display mt-2 text-2xl font-bold text-white">
              Review queue
            </h1>
            <nav
              class="mt-4 flex gap-1 border-b border-white/10"
              role="tablist"
              aria-label="Admin sections"
            >
              <For each={TABS}>
                {(t) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab() === t.id}
                    onClick={() => setTab(t.id)}
                    class={`-mb-px border-b-2 px-3 py-2 text-sm font-bold transition ${
                      tab() === t.id
                        ? "border-[#63e6be] text-[#63e6be]"
                        : "border-transparent text-[#5a5a6e] hover:text-white"
                    }`}
                  >
                    {t.label}
                  </button>
                )}
              </For>
            </nav>
          </header>

          <Show when={tab() === "reports"}>
            <ReportsQueue />
          </Show>
        </Match>
      </Switch>
    </main>
  );
}
