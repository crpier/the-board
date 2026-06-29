import { api } from "@convex/_generated/api";
import { Title } from "@solidjs/meta";
import { A, useNavigate, useParams } from "@solidjs/router";
import { Match, Switch } from "solid-js";
import { MemeCard } from "~/components/MemeCard";
import { useQuery } from "~/lib/convex-solid";

/**
 * Canonical meme detail route (`/meme/:id`, epic #41).
 *
 * The id comes straight from the URL as a string and is handed to `getMeme`
 * untouched — the query normalizes a malformed id to `null` rather than throwing
 * (see `convex/memes.ts`), so a bad id lands in the same not-found state as a
 * hidden/deleted/not-yours-private meme. Authorization lives entirely server-side;
 * this page only renders the four outcomes it can observe.
 *
 * `useQuery` keeps the subscription live, so an owner hiding or deleting the meme
 * elsewhere flips an open guest page to not-found with no refetch. Args are an
 * accessor so navigating between detail pages re-subscribes to the new id.
 */
export default function MemeDetail() {
  const params = useParams();
  const navigate = useNavigate();
  // `params.id` is typed `string | undefined`; the route always supplies it, but
  // an empty fallback normalizes to not-found in `getMeme` rather than narrowing.
  const meme = useQuery(api.memes.getMeme, () => ({ id: params.id ?? "" }));

  return (
    <main class="mx-auto max-w-2xl space-y-5 px-5 py-6">
      <Switch>
        {/* Error: the query threw. Distinct from not-found and styled like the feed's error banner. */}
        <Match when={meme.error()}>
          <Title>Meme · The Board</Title>
          <p class="text-[#d08770]">
            {meme.error()?.message ?? "Could not load this meme."}
          </p>
        </Match>

        {/* Loading: the muted one-liner the feed uses. */}
        <Match when={meme.data() === undefined}>
          <Title>Meme · The Board</Title>
          <p class="text-[#5a5a6e]">Loading...</p>
        </Match>

        {/* Not viewable: one identical message for every null cause (bad id,
            hidden, deleted, someone else's private), never revealing existence. */}
        <Match when={meme.data() === null}>
          <Title>Not found · The Board</Title>
          <div class="rounded-2xl border border-white/10 p-6 text-center">
            <p class="text-[#5a5a6e]">
              This meme doesn&apos;t exist or isn&apos;t available.
            </p>
            <A
              href="/"
              class="mt-3 inline-block text-sm text-[#63e6be] transition-colors hover:text-[#63e6be]/80"
            >
              Back to the feed
            </A>
          </div>
        </Match>

        {/* Found: reuse MemeCard wholesale (media, tags, votes, owner edit/delete).
            Deleting from here has nowhere to return to, so go home. */}
        <Match when={meme.data()}>
          {(found) => (
            <>
              <Title>{found().title ?? "Meme"} · The Board</Title>
              <MemeCard meme={found()} onDeleted={() => navigate("/")} />
            </>
          )}
        </Match>
      </Switch>
    </main>
  );
}
