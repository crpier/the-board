import { api } from "@convex/_generated/api";
import type { FeedMeme } from "@convex/memes";
import { Title } from "@solidjs/meta";
import { A, useParams } from "@solidjs/router";
import {
  createEffect,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from "solid-js";
import { MemeCard } from "~/components/MemeCard";
import { convex } from "~/lib/convex";
import { useQuery } from "~/lib/convex-solid";

type Meme = FeedMeme;

export default function Profile() {
  const params = useParams();
  const profileId = () => params.id ?? "";
  const profile = useQuery(api.memes.getProfile, () => ({
    profileId: profileId(),
  }));
  const firstPage = useQuery(api.memes.listProfileMemes, () => ({
    profileId: profileId(),
    paginationOpts: { numItems: 5, cursor: null },
  }));
  const [items, setItems] = createSignal<Meme[]>([]);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [isDone, setIsDone] = createSignal(false);
  const [isLoadingMore, setIsLoadingMore] = createSignal(false);
  const [sentinelRef, setSentinelRef] = createSignal<HTMLDivElement>();

  createEffect(() => {
    profileId();
    setItems([]);
    setCursor(null);
    setIsDone(false);
  });

  createEffect(() => {
    const page = firstPage.data();
    if (!page) return;
    setItems(page.page);
    setCursor(page.continueCursor);
    setIsDone(page.isDone);
  });

  createEffect(() => {
    const sentinel = sentinelRef();
    if (!sentinel || isDone()) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinel);
    onCleanup(() => observer.disconnect());
  });

  async function loadMore() {
    if (isLoadingMore() || isDone() || cursor() === null) return;
    setIsLoadingMore(true);
    try {
      const nextPage = await convex.query(api.memes.listProfileMemes, {
        profileId: profileId(),
        paginationOpts: { numItems: 5, cursor: cursor() },
      });
      setItems((current) => [...current, ...nextPage.page]);
      setCursor(nextPage.continueCursor);
      setIsDone(nextPage.isDone);
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl space-y-5 px-5 py-6">
      <Switch>
        <Match when={profile.error() || firstPage.error()}>
          <Title>Profile · The Board</Title>
          <p class="text-[#d08770]">Could not load this profile.</p>
        </Match>
        <Match
          when={profile.data() === undefined || firstPage.data() === undefined}
        >
          <Title>Profile · The Board</Title>
          <p class="text-[#5a5a6e]">Loading...</p>
        </Match>
        <Match when={profile.data() === null}>
          <Title>Not found · The Board</Title>
          <div class="rounded-2xl border border-white/10 p-6 text-center">
            <p class="text-[#5a5a6e]">This profile doesn&apos;t exist.</p>
            <A
              href="/"
              class="mt-3 inline-block text-sm text-[#63e6be] transition-colors hover:text-[#63e6be]/80"
            >
              Back to the feed
            </A>
          </div>
        </Match>
        <Match when={profile.data()}>
          {(found) => (
            <>
              <Title>@{found().displayName} · The Board</Title>
              <header class="rounded-2xl border border-white/10 p-5">
                <p class="text-xs tracking-[0.3em] text-[#5a5a6e] uppercase">
                  Profile
                </p>
                <h1 class="font-display mt-2 text-2xl font-bold text-white">
                  @{found().displayName}
                </h1>
                <p class="mt-1 text-sm text-[#5a5a6e]">
                  {found().isViewer
                    ? "Your published posts"
                    : "Published posts"}
                </p>
              </header>
              <Show
                when={items().length > 0}
                fallback={<p class="text-[#5a5a6e]">No posts yet.</p>}
              >
                <For each={items()}>{(meme) => <MemeCard meme={meme} />}</For>
              </Show>
              <Show when={isLoadingMore()}>
                <p class="py-4 text-center text-sm text-[#5a5a6e]">
                  Loading more...
                </p>
              </Show>
              <div ref={setSentinelRef} class="h-px" aria-hidden="true" />
            </>
          )}
        </Match>
      </Switch>
    </main>
  );
}
