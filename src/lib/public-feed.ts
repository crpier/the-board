import { api } from "../../convex/_generated/api";
import { useQuery } from "~/lib/convex-solid";

const firstPageArgs = {
  paginationOpts: {
    numItems: 5,
    cursor: null,
  },
} as const;

export function usePublicFeed() {
  return useQuery(api.memes.listPublicMemes, firstPageArgs);
}
