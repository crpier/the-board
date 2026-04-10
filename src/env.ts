import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  runtimeEnv: import.meta.env,
  client: {
    VITE_CONVEX_DEPLOYMENT: z.string(),
    VITE_CONVEX_SITE_URL: z.url(),
    VITE_CONVEX_URL: z.url(),
  },
});
