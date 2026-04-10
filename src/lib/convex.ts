import { ConvexClient } from "convex/browser";
import { env } from "~/env";

export const convex = new ConvexClient(env.VITE_CONVEX_URL);
