import { usePublicFeed } from "~/lib/public-feed";
import { Title } from "@solidjs/meta";
import { For, Show } from "solid-js";
import { MemeCard } from "~/components/MemeCard";

export default function Home() {
  const memes = usePublicFeed();

  return (
    <main class="mx-auto max-w-2xl space-y-5 px-5 py-6">
      <Title>The Board</Title>
      <Show
        when={!memes.isLoading()}
        fallback={<p class="text-[#5a5a6e]">Loading...</p>}
      >
        <Show
          when={(memes.data()?.length ?? 0) > 0}
          fallback={<p class="text-[#5a5a6e]">No memes for you</p>}
        >
          <For each={memes.data()}>{(meme) => <MemeCard meme={meme} />}</For>
        </Show>
      </Show>
    </main>
  );
}
