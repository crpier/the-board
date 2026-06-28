import { createContextProvider } from "@solid-primitives/context";
import { ConvexHttpClient } from "convex/browser";
import type { ConvexClient } from "convex/browser";
import type { ParentProps } from "solid-js";
import { createSignal, onMount } from "solid-js";
import { env } from "~/env";

const JWT_KEY = "__convexAuthJWT";
const REFRESH_KEY = "__convexAuthRefreshToken";
const VERIFIER_KEY = "__convexAuthOAuthVerifier";

type AuthState = {
  isLoading: () => boolean;
  isAuthenticated: () => boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const [ConvexAuthProvider, useConvexAuth] = createContextProvider(
  (props: ParentProps<{ client: ConvexClient }>): AuthState => {
    const [token, setToken] = createSignal<string | null>(null);
    const [isLoading, setIsLoading] = createSignal(true);

    props.client.setAuth(async () => token());

    const httpClient = new ConvexHttpClient(env.VITE_CONVEX_URL);

    async function signIn() {
      // This mirrors Convex Auth's React provider behavior.
      // You may need a narrow type cast here because Convex Auth exposes
      // internal action references as "auth:signIn".
      const result = await props.client.action("auth:signIn" as never, {
        provider: "google",
        params: { redirectTo: "/" },
        verifier: localStorage.getItem(VERIFIER_KEY) ?? undefined,
      } as never);

      if (result.redirect) {
        localStorage.setItem(VERIFIER_KEY, result.verifier);
        window.location.href = String(result.redirect);
        return;
      }

      if (result.tokens) {
        localStorage.setItem(JWT_KEY, result.tokens.token);
        localStorage.setItem(REFRESH_KEY, result.tokens.refreshToken);
        setToken(result.tokens.token);
      }
    }

    async function signOut() {
      try {
        await props.client.action("auth:signOut" as never, {} as never);
      } finally {
        localStorage.removeItem(JWT_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setToken(null);
      }
    }

    onMount(async () => {
      const code = new URLSearchParams(window.location.search).get("code");

      if (code) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("code");
        window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search);

        const result = await httpClient.action("auth:signIn" as never, {
          params: { code },
          verifier: localStorage.getItem(VERIFIER_KEY) ?? undefined,
        } as never);

        if (result.tokens) {
          localStorage.setItem(JWT_KEY, result.tokens.token);
          localStorage.setItem(REFRESH_KEY, result.tokens.refreshToken);
          setToken(result.tokens.token);
        }

        localStorage.removeItem(VERIFIER_KEY);
        setIsLoading(false);
        return;
      }

      setToken(localStorage.getItem(JWT_KEY));
      setIsLoading(false);
    });

    return {
      isLoading,
      isAuthenticated: () => token() !== null,
      signIn,
      signOut,
    };
  },
);
