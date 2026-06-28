import { usePublicFeed } from "~/lib/public-feed";
import { Title } from "@solidjs/meta";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { MemeCard } from "~/components/MemeCard";
import { Doc } from "@convex/_generated/dataModel";
import { api } from "@convex/_generated/api";
import { convex } from "~/lib/convex";
import Navbar from "~/components/Navbar";
import { current } from "@convex/viewer";

type Meme = Doc<"memes">;

export default function Home() {
  const memes = usePublicFeed();
  const [items, setItems] = createSignal<Meme[]>([]);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [isDone, setIsDone] = createSignal(false);
  const [isLoadingMore, setIsLoadingMore] = createSignal(false);
  const [sentinelRef, setSentinelRef] = createSignal<HTMLDivElement>();

  createEffect(() => {
    const sentinel = sentinelRef();
    if (!sentinel) return;
    if (isDone()) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinel);
    onCleanup(() => observer.disconnect());
  });

  // This is for the first load.
  createEffect(() => {
    const firstPage = memes.data();
    if (!firstPage) return;

    setItems((currentItems) => {
      if (currentItems.length === 0) {
        return firstPage.page;
      }

      const firstPageIds = new Set(firstPage.page.map((meme) => meme._id));
      const remainingItems = currentItems.filter(
        (meme) => !firstPageIds.has(meme._id),
      );

      return [...firstPage.page, ...remainingItems];
    });
    setCursor(firstPage.continueCursor);
    setIsDone(firstPage.isDone);
  });

  async function loadMore() {
    if (isLoadingMore() || isDone() || cursor() === null) return;
    setIsLoadingMore(true);

    try {
      const nextPage = await convex.query(api.memes.listPublicMemes, {
        paginationOpts: {
          numItems: 5,
          cursor: cursor(),
        },
      });
      // TODO: I shouldn't use `!`, but can't find a nice way to
      // exit early if the data is undefined in typescript.
      setItems((items) => [...items, ...nextPage.page]);
      setCursor(nextPage.continueCursor);
      setIsDone(nextPage.isDone);
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <main class="mx-auto max-w-2xl space-y-5 px-5 py-6">
      <Navbar></Navbar>
      <Title>The Board</Title>
      <Show
        when={memes.data() !== undefined || memes.error()}
        fallback={<p class="text-[#5a5a6e]">Loading...</p>}
      >
        <Show
          when={!memes.error()}
          fallback={
            <p class="text-[#d08770]">
              {memes.error()?.message ?? "Could not load memes."}
            </p>
          }
        >
          <Show
            when={(items().length ?? 0) > 0}
            fallback={<p class="text-[#5a5a6e]">No memes for you</p>}
          >
            <For each={items()}>{(meme) => <MemeCard meme={meme} />}</For>
          </Show>
          <Show when={isLoadingMore()}>
            <p class="py-4 text-center text-sm text-[#5a5a6e]">
              Loading more...
            </p>
          </Show>
          <div ref={setSentinelRef} class="h-px" aria-hidden="true" />
        </Show>
      </Show>
    </main>
  );
}
