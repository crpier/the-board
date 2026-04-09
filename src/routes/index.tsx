import { Title } from "@solidjs/meta";
import { For, Show } from "solid-js";
import { api } from "../../convex/_generated/api";
import { prefetchQuery, setupConvexHttp, useQuery } from "~/lib/cvxsolid";
import { env } from "~/env";
import { createAsync, query } from "@solidjs/router";

const getPublicMemes = query(async () => {
  "use server";

  const client = setupConvexHttp(env.VITE_CONVEX_URL);
  return await prefetchQuery(client, api.memes.listPublicMemes, {});
}, "publicMemes");

export default function Home() {
  const initialMemes = createAsync(() => getPublicMemes());
  const memes = useQuery(api.memes.listPublicMemes, {}, () => ({
    initialData: initialMemes(),
    keepPreviousData: true,
  }));
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
