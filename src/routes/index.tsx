import { Title } from "@solidjs/meta";
import { createAsync, query } from "@solidjs/router";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { For, Show } from "solid-js";
import { env } from "~/env";

const getPublicMemes = query(async () => {
  "use server";
  const convex = new ConvexHttpClient(env.VITE_CONVEX_URL);
  return await convex.query(api.memes.listPublicMemes, {});
}, "publicMemes");

export default function Home() {
  const memes = createAsync(() => getPublicMemes());

  return (
    <main>
      <Title>The Board</Title>
      <h1> Welcome to the Board</h1>
      <Show
        when={(memes()?.length ?? 0) > 0}
        fallback={<p>No memes for you</p>}
      >
        <ul>
          <For each={memes()}>{(meme) => <li>{meme.title}</li>}</For>
        </ul>
      </Show>
    </main>
  );
}
