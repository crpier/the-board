import { createContextProvider } from "@solid-primitives/context";
import { ConvexHttpClient } from "convex/browser";
import type { ConvexClient } from "convex/browser";
import type { ParentProps } from "solid-js";
import { createSignal, onMount } from "solid-js";
import { env } from "~/env";

const JWT_KEY = "__convexAuthJWT";
const REFRESH_KEY = "__convexAuthRefreshToken";
const VERIFIER_KEY = "__convexAuthOAuthVerifier";

type Tokens = { token: string; refreshToken: string };

// `auth:signIn` is an internal Convex Auth action with no generated types, so we
// describe the shape we rely on and cast at the call sites.
type SignInResult = {
  redirect?: string;
  verifier?: string;
  tokens?: Tokens | null;
};

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

    // Unauthenticated client for the OAuth code and refresh-token exchanges.
    // These mirror Convex Auth's `unauthenticatedCall`: they must not carry the
    // (possibly expired) session token.
    const httpClient = new ConvexHttpClient(env.VITE_CONVEX_URL);

    function persist(tokens: Tokens | null) {
      if (tokens === null) {
        localStorage.removeItem(JWT_KEY);
        localStorage.removeItem(REFRESH_KEY);
        setToken(null);
        return;
      }
      localStorage.setItem(JWT_KEY, tokens.token);
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
      setToken(tokens.token);
    }

    // Convex calls this whenever it needs a token. It runs it once on `setAuth`
    // (forceRefreshToken=false) and then again automatically shortly before the
    // JWT expires (forceRefreshToken=true). Handling that refresh here is the
    // main reason this custom integration exists — the React provider does it
    // for us, but its bindings are React-only.
    async function fetchAccessToken({
      forceRefreshToken,
    }: {
      forceRefreshToken: boolean;
    }): Promise<string | null> {
      if (!forceRefreshToken) {
        return token();
      }

      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (refreshToken === null) {
        persist(null);
        return null;
      }

      try {
        const result = (await httpClient.action(
          "auth:signIn" as never,
          {
            refreshToken,
          } as never,
        )) as SignInResult;
        persist(result.tokens ?? null);
        return token();
      } catch {
        // Refresh failed (e.g. revoked token); drop the session.
        persist(null);
        return null;
      }
    }

    // Re-arms the Convex client's auth: it re-runs `fetchAccessToken` and
    // reschedules the expiry refresh against the current token. Call this after
    // any token change we initiate ourselves (load, sign in, sign out). The
    // automatic expiry refresh must NOT call this — it just returns the token.
    function syncClientAuth() {
      props.client.setAuth(fetchAccessToken);
    }

    async function signIn() {
      const result = (await props.client.action(
        "auth:signIn" as never,
        {
          provider: "google",
          params: { redirectTo: "/" },
          verifier: localStorage.getItem(VERIFIER_KEY) ?? undefined,
        } as never,
      )) as SignInResult;

      if (result.redirect) {
        localStorage.setItem(VERIFIER_KEY, result.verifier ?? "");
        window.location.href = String(result.redirect);
        return;
      }

      if (result.tokens) {
        persist(result.tokens);
        syncClientAuth();
      }
    }

    async function signOut() {
      try {
        await props.client.action("auth:signOut" as never, {} as never);
      } finally {
        persist(null);
        syncClientAuth();
      }
    }

    onMount(async () => {
      const code = new URLSearchParams(window.location.search).get("code");

      if (code) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("code");
        window.history.replaceState(
          {},
          "",
          cleanUrl.pathname + cleanUrl.search,
        );

        try {
          const result = (await httpClient.action(
            "auth:signIn" as never,
            {
              params: { code },
              verifier: localStorage.getItem(VERIFIER_KEY) ?? undefined,
            } as never,
          )) as SignInResult;
          persist(result.tokens ?? null);
        } finally {
          localStorage.removeItem(VERIFIER_KEY);
        }
      } else {
        setToken(localStorage.getItem(JWT_KEY));
      }

      // Arm the Convex client only after the token is known, so its first
      // fetch returns the stored/exchanged token instead of null.
      syncClientAuth();
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
