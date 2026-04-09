import { Title } from "@solidjs/meta";
import { For, Show } from "solid-js";
import { api } from "../../convex/_generated/api";
import { useQuery } from "~/lib/cvxsolid";

export default function Home() {
  const memes = useQuery(api.memes.listPublicMemes, {});
  return (
    <main>
      <Title>The Board</Title>
      <h1>Welcome to the Board</h1>
      <Show when={!memes.isLoading()} fallback={<p>Loading...</p>}>
        <Show
          when={(memes.data()?.length ?? 0) > 0}
          fallback={<p>No memes for you</p>}
        >
          <ul>
            <For each={memes.data()}>{(meme) => <li>{meme.title}</li>}</For>
          </ul>
        </Show>
      </Show>
    </main>
  );
}
