import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { UserRosterRow } from "@convex/users";
import { A } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { For, Match, Show, Switch, createEffect, createSignal } from "solid-js";
import { convex } from "~/lib/convex";
import { useConvexAuth } from "~/lib/convex-auth-solid";
import { useMutation, useQuery } from "~/lib/convex-solid";

const PAGE_SIZE = 20;

/**
 * Admin-only user role management (#68), deliberately isolated on its own
 * route rather than folded into a shared `/admin` landing page — a reports
 * queue is being built at `/admin` in parallel, and this slice has nothing to
 * do with it (ADR 0013). Non-admins (including guests) see the same
 * not-found treatment as an unknown page; there is no separate "forbidden"
 * state.
 */
export default function AdminUsers() {
  const auth = useConvexAuth()!;
  // Only subscribe once authenticated; a guest is routed to not-found before
  // this would resolve anyway.
  const viewer = useQuery(api.viewer.current, {}, () => ({
    enabled: auth.isAuthenticated(),
  }));

  return (
    <Switch fallback={<CenteredMessage text="Checking auth…" />}>
      <Match when={auth.isLoading()}>
        <CenteredMessage text="Checking auth…" />
      </Match>
      <Match when={!auth.isAuthenticated()}>
        <AdminGateNotFound />
      </Match>
      <Match when={viewer.data() === undefined}>
        <CenteredMessage text="Checking auth…" />
      </Match>
      <Match when={viewer.data()?.isAdmin !== true}>
        <AdminGateNotFound />
      </Match>
      <Match when={viewer.data()?.isAdmin === true}>
        <UserRoster viewerId={viewer.data()!.id} />
      </Match>
    </Switch>
  );
}

function CenteredMessage(props: { text: string }) {
  return (
    <main class="mx-auto max-w-3xl px-5 py-6">
      <p class="text-[#5a5a6e]">{props.text}</p>
    </main>
  );
}

/**
 * The same "this doesn't exist" shape a non-admin gets for any hidden
 * resource elsewhere (e.g. a private meme's detail page) — admin status is
 * never distinguished from "not found" at the product surface.
 */
function AdminGateNotFound() {
  return (
    <main class="mx-auto max-w-3xl px-5 py-6">
      <Title>Not Found</Title>
      <div class="rounded-2xl border border-white/10 p-6 text-center">
        <p class="text-[#5a5a6e]">This page doesn&apos;t exist.</p>
        <A
          href="/"
          class="mt-3 inline-block text-sm text-[#63e6be] transition-colors hover:text-[#63e6be]/80"
        >
          Back to the feed
        </A>
      </div>
    </main>
  );
}

function UserRoster(props: { viewerId: Id<"users"> }) {
  const firstPage = useQuery(api.users.listUsers, () => ({
    paginationOpts: { numItems: PAGE_SIZE, cursor: null },
  }));

  const [items, setItems] = createSignal<UserRosterRow[]>([]);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [isDone, setIsDone] = createSignal(true);
  // Once the roster is seeded from the first reactive page we stop re-syncing
  // from it: a promote/demote mutation changes the `users` table, which would
  // otherwise re-fire this reactive query and reset `items` back to just page
  // one, discarding anything loaded via "Load more". Row updates after a
  // mutation are applied locally instead (see `onRoleChanged`).
  const [seeded, setSeeded] = createSignal(false);
  const [isLoadingMore, setIsLoadingMore] = createSignal(false);
  const [loadError, setLoadError] = createSignal<string | null>(null);

  createEffect(() => {
    const page = firstPage.data();
    if (!page || seeded()) return;
    setItems(page.page);
    setCursor(page.continueCursor);
    setIsDone(page.isDone);
    setSeeded(true);
  });

  async function loadMore() {
    if (isLoadingMore() || isDone() || cursor() === null) return;
    setIsLoadingMore(true);
    setLoadError(null);
    try {
      const nextPage = await convex.query(api.users.listUsers, {
        paginationOpts: { numItems: PAGE_SIZE, cursor: cursor() },
      });
      setItems((current) => [...current, ...nextPage.page]);
      setCursor(nextPage.continueCursor);
      setIsDone(nextPage.isDone);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load more.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  function onRoleChanged(userId: Id<"users">, isAdmin: boolean) {
    setItems((current) =>
      current.map((row) => (row._id === userId ? { ...row, isAdmin } : row)),
    );
  }

  return (
    <main class="mx-auto max-w-3xl space-y-5 px-5 py-6">
      <Title>Admin · Users · The Board</Title>
      <header>
        <p class="text-xs tracking-[0.3em] text-[#5a5a6e] uppercase">Admin</p>
        <h1 class="font-display mt-2 text-2xl font-bold text-white">Users</h1>
        <p class="mt-1 text-sm text-[#5a5a6e]">
          Promote a user to admin, or demote an admin back to a regular user.
        </p>
      </header>

      <Show
        when={!firstPage.error()}
        fallback={<p class="text-[#ff8787]">Could not load users.</p>}
      >
        <Show when={seeded()} fallback={<p class="text-[#5a5a6e]">Loading…</p>}>
          <ul class="divide-y divide-white/10 rounded-2xl border border-white/10">
            <For each={items()}>
              {(row) => (
                <UserRow
                  row={row}
                  isSelf={row._id === props.viewerId}
                  onRoleChanged={onRoleChanged}
                />
              )}
            </For>
          </ul>

          <Show when={!isDone()}>
            <div class="flex justify-center">
              <button
                type="button"
                disabled={isLoadingMore()}
                onClick={() => void loadMore()}
                class="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-[#5a5a6e] transition hover:text-[#63e6be] disabled:opacity-50"
              >
                {isLoadingMore() ? "Loading…" : "Load more"}
              </button>
            </div>
          </Show>
          <Show when={loadError()}>
            {(message) => (
              <p class="text-center text-sm text-[#ff8787]">{message()}</p>
            )}
          </Show>
        </Show>
      </Show>
    </main>
  );
}

function UserRow(props: {
  row: UserRosterRow;
  isSelf: boolean;
  onRoleChanged: (userId: Id<"users">, isAdmin: boolean) => void;
}) {
  const promoteUser = useMutation(api.users.promoteUser);
  const demoteUser = useMutation(api.users.demoteUser);
  const [error, setError] = createSignal<string | null>(null);

  const isLoading = () => promoteUser.isLoading() || demoteUser.isLoading();

  async function onPromote() {
    if (isLoading()) return;
    setError(null);
    try {
      await promoteUser.mutate({ userId: props.row._id });
      props.onRoleChanged(props.row._id, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promote failed.");
    }
  }

  async function onDemote() {
    if (isLoading()) return;
    setError(null);
    try {
      await demoteUser.mutate({ userId: props.row._id });
      props.onRoleChanged(props.row._id, false);
    } catch (err) {
      // Most notably the server's last-admin guard, surfaced verbatim.
      setError(err instanceof Error ? err.message : "Demote failed.");
    }
  }

  return (
    <li class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
      <div class="min-w-0">
        <p class="truncate text-sm font-bold text-white">
          {props.row.displayName}
          <Show when={props.isSelf}>
            <span class="ml-1.5 text-xs font-normal text-[#5a5a6e]">(you)</span>
          </Show>
        </p>
        <Show when={props.row.email}>
          {(email) => <p class="truncate text-xs text-[#5a5a6e]">{email()}</p>}
        </Show>
      </div>

      <div class="flex items-center gap-3">
        <span
          class={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
            props.row.isAdmin
              ? "bg-[#ffd43b]/10 text-[#ffd43b]"
              : "bg-white/5 text-[#5a5a6e]"
          }`}
        >
          {props.row.isAdmin ? "Admin" : "User"}
        </span>

        <Show
          when={props.row.isAdmin}
          fallback={
            <button
              type="button"
              disabled={isLoading()}
              onClick={() => void onPromote()}
              class="text-xs font-bold text-[#5a5a6e] transition-colors hover:text-[#63e6be] disabled:opacity-50"
            >
              {promoteUser.isLoading() ? "Promoting…" : "Promote"}
            </button>
          }
        >
          <button
            type="button"
            disabled={isLoading()}
            onClick={() => void onDemote()}
            class="text-xs font-bold text-[#5a5a6e] transition-colors hover:text-[#ff8787] disabled:opacity-50"
          >
            {demoteUser.isLoading() ? "Demoting…" : "Demote"}
          </button>
        </Show>
      </div>

      <Show when={error()}>
        {(message) => <p class="w-full text-xs text-[#ff8787]">{message()}</p>}
      </Show>
    </li>
  );
}
