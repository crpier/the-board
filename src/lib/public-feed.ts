import { createAsync, query } from "@solidjs/router";
import { api } from "../../convex/_generated/api";
import { prefetchQuery, setupConvexHttp, useQuery } from "~/lib/convex-solid";
import { env } from "~/env";

const getPublicFeed = query(async () => {
  "use server";

  const client = setupConvexHttp(env.VITE_CONVEX_URL);
  return await prefetchQuery(client, api.memes.listPublicMemes, {});
}, "publicFeed");

export function usePublicFeed() {
  const initialFeed = createAsync(() => getPublicFeed());

  return useQuery(api.memes.listPublicMemes, {}, () => ({
    initialData: initialFeed(),
    keepPreviousData: true,
  }));
}
