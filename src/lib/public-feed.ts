import { createAsync, query } from "@solidjs/router";
import { api } from "../../convex/_generated/api";
import { prefetchQuery, setupConvexHttp, useQuery } from "~/lib/convex-solid";
import { env } from "~/env";

const firstPageArgs = {
  paginationOpts: {
    numItems: 5,
    cursor: null,
  },
} as const;

const getPublicFeed = query(async () => {
  "use server";

  const client = setupConvexHttp(env.VITE_CONVEX_URL);
  return await prefetchQuery(client, api.memes.listPublicMemes, firstPageArgs);
}, "publicFeed");

export function usePublicFeed() {
  const initialFeed = createAsync(() => getPublicFeed());
  const queryOptions = () => ({
    initialData: initialFeed(),
    keepPreviousData: true,
  });

  return useQuery(api.memes.listPublicMemes, firstPageArgs, queryOptions);
}
