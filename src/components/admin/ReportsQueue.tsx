import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { For, Show, createEffect, createSignal } from "solid-js";
import { convex } from "~/lib/convex";
import { useMutation, useQuery } from "~/lib/convex-solid";

type ReportQueueItem = FunctionReturnType<
  typeof api.reports.listOpenReports
>["page"][number];

const REASON_LABELS: Record<ReportQueueItem["reason"], string> = {
  spam: "Spam",
  harassment: "Harassment",
  hate_speech: "Hate speech",
  illegal_content: "Illegal content",
  other: "Other",
};

const PAGE_SIZE = 20;

/**
 * The "Reports" tab of `/admin` (#67): the open-reports queue with resolve
 * actions. Structured as the same reactive-first-page +
 * load-more-via-one-shot-query pattern `Profile` uses for its meme list, so
 * it stays live while an admin works through the queue without needing
 * infinite-scroll machinery for what's expected to be a short, low-traffic
 * list.
 *
 * Resolving an item removes it from `items` directly (mirroring
 * `MemeCard`'s `onDeleted` callback) rather than relying solely on
 * reactivity — the first page re-syncs on its own once a report leaves
 * `status: "open"`, but items loaded via "Load more" are static one-shot
 * snapshots that need the same explicit removal.
 */
export function ReportsQueue() {
  const firstPage = useQuery(api.reports.listOpenReports, () => ({
    paginationOpts: { numItems: PAGE_SIZE, cursor: null },
  }));
  const [items, setItems] = createSignal<ReportQueueItem[]>([]);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [isDone, setIsDone] = createSignal(false);
  const [isLoadingMore, setIsLoadingMore] = createSignal(false);

  createEffect(() => {
    const page = firstPage.data();
    if (!page) return;
    setItems(page.page);
    setCursor(page.continueCursor);
    setIsDone(page.isDone);
  });

  async function loadMore() {
    if (isLoadingMore() || isDone() || cursor() === null) return;
    setIsLoadingMore(true);
    try {
      const nextPage = await convex.query(api.reports.listOpenReports, {
        paginationOpts: { numItems: PAGE_SIZE, cursor: cursor() },
      });
      setItems((current) => [...current, ...nextPage.page]);
      setCursor(nextPage.continueCursor);
      setIsDone(nextPage.isDone);
    } finally {
      setIsLoadingMore(false);
    }
  }

  function onResolved(reportId: Id<"reports">) {
    setItems((current) => current.filter((r) => r._id !== reportId));
  }

  return (
    <Show
      when={firstPage.data() !== undefined}
      fallback={<p class="text-[#5a5a6e]">Loading...</p>}
    >
      <div class="space-y-3">
        <Show
          when={items().length > 0}
          fallback={<p class="text-[#5a5a6e]">No open reports.</p>}
        >
          <For each={items()}>
            {(report) => <ReportRow report={report} onResolved={onResolved} />}
          </For>
        </Show>
        <Show when={!isDone()}>
          <button
            type="button"
            disabled={isLoadingMore()}
            onClick={() => void loadMore()}
            class="text-sm text-[#63e6be] transition-colors hover:text-[#63e6be]/80 disabled:opacity-50"
          >
            {isLoadingMore() ? "Loading…" : "Load more"}
          </button>
        </Show>
      </div>
    </Show>
  );
}

function ReportRow(props: {
  report: ReportQueueItem;
  onResolved: (reportId: Id<"reports">) => void;
}) {
  const resolveReport = useMutation(api.reports.resolveReport);
  const [error, setError] = createSignal<string | null>(null);

  async function resolve(resolution: "hide" | "dismiss") {
    if (resolveReport.isLoading()) return;
    setError(null);
    try {
      await resolveReport.mutate({ reportId: props.report._id, resolution });
      props.onResolved(props.report._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolve failed.");
    }
  }

  // Resolve the polymorphic target (#84) into a flat shape the row renders,
  // so the JSX below doesn't branch on `targetType` everywhere.
  const target = () => {
    const r = props.report;
    if (r.targetType === "template") {
      return {
        available: r.templateAvailable,
        mediaUrl: r.templateMediaUrl,
        mediaType: undefined as "video" | undefined,
        label: r.templateName,
        kind: "template" as const,
      };
    }
    return {
      available: r.memeAvailable,
      mediaUrl: r.memeMediaUrl,
      mediaType: r.memeMediaType === "video" ? ("video" as const) : undefined,
      label: r.memeTitle,
      kind: "meme" as const,
    };
  };

  return (
    <article class="flex flex-wrap items-start gap-3 rounded-2xl border border-white/10 p-3">
      <Show
        when={target().available && target().mediaUrl}
        fallback={
          <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[#2a2a3e] text-[10px] text-[#5a5a6e]">
            gone
          </div>
        }
      >
        {(mediaUrl) => (
          <Show
            when={target().mediaType === "video"}
            fallback={
              <img
                src={mediaUrl()}
                alt=""
                class="h-16 w-16 shrink-0 rounded-lg object-cover"
              />
            }
          >
            <video
              src={mediaUrl()}
              class="h-16 w-16 shrink-0 rounded-lg bg-black object-cover"
              muted
              preload="metadata"
            />
          </Show>
        )}
      </Show>

      <div class="min-w-0 flex-1 space-y-1">
        <p class="text-sm font-bold text-white">
          {REASON_LABELS[props.report.reason]}
          <span class="ml-2 text-xs font-normal tracking-wide text-[#5a5a6e] uppercase">
            {target().kind}
          </span>
          <Show when={target().label}>
            {(label) => (
              <span class="ml-2 font-normal text-[#5a5a6e]">
                on &ldquo;{label()}&rdquo;
              </span>
            )}
          </Show>
        </p>
        <Show when={props.report.details}>
          {(details) => (
            <p class="text-xs break-words text-[#8a8a9e]">{details()}</p>
          )}
        </Show>
        <p class="text-xs text-[#5a5a6e]">
          Reported by @{props.report.reporterName}
        </p>
        <Show when={!target().available}>
          <p class="text-xs text-[#ffd43b]">
            {target().kind === "template" ? "Template" : "Meme"} already
            unavailable — you can still dismiss this report.
          </p>
        </Show>
        <Show when={error()}>
          {(message) => <p class="text-xs text-[#ff8787]">{message()}</p>}
        </Show>
      </div>

      <div class="flex shrink-0 gap-2">
        <button
          type="button"
          disabled={resolveReport.isLoading() || !target().available}
          onClick={() => void resolve("hide")}
          title={
            target().available
              ? `Hide the reported ${target().kind}`
              : `${target().kind} is already unavailable`
          }
          class="rounded-lg border border-[#ff8787]/30 bg-[#ff8787]/10 px-3 py-1.5 text-xs font-bold text-[#ff8787] transition disabled:cursor-not-allowed disabled:opacity-50"
        >
          {target().kind === "template" ? "Remove template" : "Hide meme"}
        </button>
        <button
          type="button"
          disabled={resolveReport.isLoading()}
          onClick={() => void resolve("dismiss")}
          class="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-[#5a5a6e] transition disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </article>
  );
}
