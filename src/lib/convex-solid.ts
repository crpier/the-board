import {
  onCleanup,
  createEffect,
  createSignal,
  batch,
  on,
  type Accessor,
} from "solid-js";
import { createContextProvider } from "@solid-primitives/context";
import { ConvexClient, type OptimisticUpdate } from "convex/browser";
import {
  type FunctionReference,
  type FunctionArgs,
  type FunctionReturnType,
  getFunctionName,
} from "convex/server";

// Type helpers for reactive values
type MaybeAccessor<T> = T | Accessor<T>;

function resolve<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as Accessor<T>)() : value;
}

// Create context with proper typing
export const [ConvexProvider, useConvexClient] = createContextProvider(
  ({ client }: { client: ConvexClient }) => {
    return client;
  },
);

// Query options
interface QueryOptions {
  enabled?: boolean;
}

// Query return type
interface QueryReturn<T> {
  data: Accessor<T | undefined>;
  error: Accessor<Error | undefined>;
  isLoading: Accessor<boolean>;
  isStale: Accessor<boolean>;
  refetch: () => void;
}

// Main query hook
export function useQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: MaybeAccessor<FunctionArgs<Query>>,
  options?: MaybeAccessor<QueryOptions>,
): QueryReturn<FunctionReturnType<Query>> {
  type Data = FunctionReturnType<Query>;
  const defaultOptions = {} as QueryOptions;

  // Resolve reactive values
  const getArgs = () => resolve(args);
  const getOptions = () => resolve(options) ?? defaultOptions;

  const client = useConvexClient();
  if (!client) {
    throw new Error("useQuery must be used within ConvexProvider");
  }

  const [reloadKey, setReloadKey] = createSignal(0);
  const [data, setData] = createSignal<Data | undefined>();
  const [error, setError] = createSignal<Error | undefined>();
  const [isLoading, setIsLoading] = createSignal(false);
  const [isStale, setIsStale] = createSignal(false);

  const refetch = () => setReloadKey((v) => v + 1);

  createEffect(
    on([getArgs, getOptions, reloadKey], ([resolvedArgs, opts]) => {
      if (opts.enabled === false) {
        batch(() => {
          setError(undefined);
          setIsLoading(false);
          setIsStale(false);
        });
        return;
      }

      const hasData = data() !== undefined;

      batch(() => {
        setError(undefined);
        setIsLoading(!hasData);
        setIsStale(hasData);
      });

      try {
        const local = client.client.localQueryResult(
          getFunctionName(query),
          resolvedArgs,
        );
        if (local !== undefined) {
          batch(() => {
            setData(() => local as Data);
            setError(undefined);
            setIsLoading(false);
            setIsStale(false);
          });
        }
      } catch {
        // localQueryResult can throw before initial subscription
      }

      const unsubscribe = client.onUpdate(
        query,
        resolvedArgs,
        (nextData) => {
          batch(() => {
            setData(() => nextData);
            setError(undefined);
            setIsLoading(false);
            setIsStale(false);
          });
        },
        (nextError) => {
          batch(() => {
            setError(() => nextError);
            setData(undefined);
            setIsLoading(false);
            setIsStale(false);
          });
        },
      );

      onCleanup(unsubscribe);
    }),
  );

  return { data, error, isLoading, isStale, refetch };
}

// Mutation state
interface MutationState<T> {
  data?: T;
  error?: Error;
  isLoading: boolean;
}

// Mutation return type
interface MutationReturn<TArgs, TResult> {
  mutate: (args: TArgs) => Promise<TResult>;
  mutateAsync: (args: TArgs) => Promise<TResult>;
  data: Accessor<TResult | undefined>;
  error: Accessor<Error | undefined>;
  isLoading: Accessor<boolean>;
  reset: () => void;
}

// Mutation hook
//
// Pass `optimisticUpdate` to patch query caches while the mutation is in flight.
// `ConvexClient.mutation` forwards the option to the underlying
// `BaseConvexClient`, which applies the patch immediately and rolls it back
// automatically once the mutation settles (on success or error).
export function useMutation<Mutation extends FunctionReference<"mutation">>(
  mutation: Mutation,
  optimisticUpdate?: OptimisticUpdate<FunctionArgs<Mutation>>,
): MutationReturn<FunctionArgs<Mutation>, FunctionReturnType<Mutation>> {
  type Args = FunctionArgs<Mutation>;
  type Result = FunctionReturnType<Mutation>;

  const client = useConvexClient();
  if (!client) {
    throw new Error("useMutation must be used within ConvexProvider");
  }

  const [state, setState] = createSignal<MutationState<Result>>({
    isLoading: false,
  });

  const mutateAsync = async (args: Args): Promise<Result> => {
    setState({ isLoading: true });

    try {
      const result = await client.mutation(
        mutation,
        args,
        optimisticUpdate ? { optimisticUpdate } : undefined,
      );
      setState({ data: result, isLoading: false });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setState({ error: err, isLoading: false });
      throw err;
    }
  };

  const reset = () => setState({ isLoading: false });

  return {
    mutate: mutateAsync,
    mutateAsync,
    data: () => state().data,
    error: () => state().error,
    isLoading: () => state().isLoading,
    reset,
  };
}

// Action hook
export function useAction<Action extends FunctionReference<"action">>(
  action: Action,
): MutationReturn<FunctionArgs<Action>, FunctionReturnType<Action>> {
  type Args = FunctionArgs<Action>;
  type Result = FunctionReturnType<Action>;

  const client = useConvexClient();
  if (!client) {
    throw new Error("useAction must be used within ConvexProvider");
  }

  const [state, setState] = createSignal<MutationState<Result>>({
    isLoading: false,
  });

  const executeAsync = async (args: Args): Promise<Result> => {
    setState({ isLoading: true });

    try {
      const result = await client.action(action, args);
      setState({ data: result, isLoading: false });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setState({ error: err, isLoading: false });
      throw err;
    }
  };

  const reset = () => setState({ isLoading: false });

  return {
    mutate: executeAsync,
    mutateAsync: executeAsync,
    data: () => state().data,
    error: () => state().error,
    isLoading: () => state().isLoading,
    reset,
  };
}
