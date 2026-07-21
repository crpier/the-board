import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ReportReason } from "@convex/validators";
import type { FunctionReturnType } from "convex/server";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
} from "solid-js";
import { ConfirmDialog } from "~/components/ConfirmDialog";
import { convex } from "~/lib/convex";
import { useMutation, useQuery } from "~/lib/convex-solid";
import { friendlyErrorMessage } from "~/lib/errors";
import { showTemplateUndoToast } from "~/lib/undo-toast";

type TemplateView = FunctionReturnType<
  typeof api.templates.listTemplates
>["page"][number];

const PAGE_SIZE = 24;

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "illegal_content", label: "Illegal content" },
  { value: "other", label: "Other" },
];

/**
 * The template library picker (#84): a newest-first grid with name search,
 * used inside the creator to choose a base image. Selecting a template hands it
 * back through `onSelect`. Each card also carries the lifecycle controls the
 * spec requires — owner delete (with the standard undo toast), admin removal,
 * and reporting — so the library is moderatable wherever it's browsed.
 *
 * Follows `ReportsQueue`'s reactive-first-page + load-more-via-one-shot-query
 * pattern: the first page stays live (so a just-deleted template drops out on
 * its own), while "Load more" appends static snapshots.
 */
export function TemplatePicker(props: {
  onSelect: (template: TemplateView) => void;
}) {
  const [rawQuery, setRawQuery] = createSignal("");
  const query = createMemo(() => rawQuery().trim());
  const isSearching = () => query().length > 0;

  const listing = useQuery(
    api.templates.listTemplates,
    () => ({ paginationOpts: { numItems: PAGE_SIZE, cursor: null } }),
    () => ({ enabled: !isSearching() }),
  );
  const searching = useQuery(
    api.templates.searchTemplates,
    () => ({
      query: query(),
      paginationOpts: { numItems: PAGE_SIZE, cursor: null },
    }),
    () => ({ enabled: isSearching() }),
  );

  const [items, setItems] = createSignal<TemplateView[]>([]);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [isDone, setIsDone] = createSignal(false);
  const [loadingMore, setLoadingMore] = createSignal(false);

  const firstPage = () => (isSearching() ? searching.data() : listing.data());

  createEffect(
    on(firstPage, (page) => {
      if (!page) return;
      setItems(page.page);
      setCursor(page.continueCursor);
      setIsDone(page.isDone);
    }),
  );

  async function loadMore() {
    if (loadingMore() || isDone() || cursor() === null) return;
    setLoadingMore(true);
    try {
      const opts = { numItems: PAGE_SIZE, cursor: cursor() };
      const next = isSearching()
        ? await convex.query(api.templates.searchTemplates, {
            query: query(),
            paginationOpts: opts,
          })
        : await convex.query(api.templates.listTemplates, {
            paginationOpts: opts,
          });
      setItems((cur) => [...cur, ...next.page]);
      setCursor(next.continueCursor);
      setIsDone(next.isDone);
    } finally {
      setLoadingMore(false);
    }
  }

  function onRemoved(id: Id<"templates">) {
    setItems((cur) => cur.filter((t) => t._id !== id));
  }

  return (
    <div class="space-y-4">
      <input
        type="search"
        value={rawQuery()}
        onInput={(e) => setRawQuery(e.currentTarget.value)}
        placeholder="Search templates by name"
        class="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[#5a5a6e]/50 focus:border-[#63e6be]/40"
      />

      <Show
        when={firstPage() !== undefined}
        fallback={<p class="text-[#5a5a6e]">Loading templates…</p>}
      >
        <Show
          when={items().length > 0}
          fallback={
            <p class="text-[#5a5a6e]">
              {isSearching()
                ? "No templates match that name."
                : "No templates yet. Save one when you publish a meme from your own image."}
            </p>
          }
        >
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <For each={items()}>
              {(template) => (
                <TemplateCard
                  template={template}
                  onSelect={props.onSelect}
                  onRemoved={onRemoved}
                />
              )}
            </For>
          </div>
        </Show>

        <Show when={!isDone()}>
          <button
            type="button"
            disabled={loadingMore()}
            onClick={() => void loadMore()}
            class="text-sm text-[#63e6be] transition-colors hover:text-[#63e6be]/80 disabled:opacity-50"
          >
            {loadingMore() ? "Loading…" : "Load more"}
          </button>
        </Show>
      </Show>
    </div>
  );
}

function TemplateCard(props: {
  template: TemplateView;
  onSelect: (template: TemplateView) => void;
  onRemoved: (id: Id<"templates">) => void;
}) {
  const deleteTemplate = useMutation(api.templates.deleteTemplate);
  const removeTemplate = useMutation(api.templates.removeTemplate);
  const reportTemplate = useMutation(api.reports.createTemplateReport);

  const [confirming, setConfirming] = createSignal<"delete" | "remove" | null>(
    null,
  );
  const [reporting, setReporting] = createSignal(false);
  const [reason, setReason] = createSignal<ReportReason>("spam");
  const [reported, setReported] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const busy = () =>
    deleteTemplate.isLoading() ||
    removeTemplate.isLoading() ||
    reportTemplate.isLoading();

  async function confirmDestroy() {
    const mode = confirming();
    if (mode === null) return;
    setError(null);
    try {
      if (mode === "delete") {
        await deleteTemplate.mutate({ templateId: props.template._id });
      } else {
        await removeTemplate.mutate({ templateId: props.template._id });
      }
      showTemplateUndoToast(props.template._id, props.template.name);
      props.onRemoved(props.template._id);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Action failed."));
    } finally {
      setConfirming(null);
    }
  }

  async function submitReport() {
    setError(null);
    try {
      await reportTemplate.mutate({
        templateId: props.template._id,
        reason: reason(),
      });
      setReported(true);
      setReporting(false);
    } catch (err) {
      setError(friendlyErrorMessage(err, "Report failed."));
    }
  }

  return (
    <article class="group relative overflow-hidden rounded-xl border border-white/10">
      <button
        type="button"
        onClick={() => props.onSelect(props.template)}
        class="block w-full text-left"
        title={`Use "${props.template.name}"`}
      >
        <img
          src={props.template.mediaUrl}
          alt={props.template.name}
          class="aspect-square w-full object-cover transition group-hover:opacity-90"
        />
        <span class="block truncate px-2 py-1.5 text-xs font-bold">
          {props.template.name}
        </span>
      </button>

      {/* Lifecycle controls, tucked below the label. */}
      <div class="flex flex-wrap gap-2 px-2 pb-2 text-[10px]">
        <button
          type="button"
          onClick={() => props.onSelect(props.template)}
          class="rounded-md border border-[#63e6be]/30 bg-[#63e6be]/10 px-2 py-0.5 font-bold text-[#63e6be]"
        >
          Use
        </button>
        <Show when={props.template.isOwner}>
          <button
            type="button"
            disabled={busy()}
            onClick={() => setConfirming("delete")}
            class="rounded-md border border-[#ff8787]/30 px-2 py-0.5 font-bold text-[#ff8787] disabled:opacity-50"
          >
            Delete
          </button>
        </Show>
        <Show when={props.template.canModerate && !props.template.isOwner}>
          <button
            type="button"
            disabled={busy()}
            onClick={() => setConfirming("remove")}
            class="rounded-md border border-[#ffd43b]/30 px-2 py-0.5 font-bold text-[#ffd43b] disabled:opacity-50"
          >
            Remove
          </button>
        </Show>
        <Show when={!props.template.isOwner && !reported()}>
          <button
            type="button"
            disabled={busy()}
            onClick={() => setReporting((v) => !v)}
            class="rounded-md border border-white/10 px-2 py-0.5 text-[#8a8a9e] disabled:opacity-50"
          >
            Report
          </button>
        </Show>
        <Show when={reported()}>
          <span class="px-1 py-0.5 text-[#5a5a6e]">Reported</span>
        </Show>
      </div>

      <Show when={reporting()}>
        <div class="flex flex-wrap items-center gap-2 px-2 pb-2">
          <select
            value={reason()}
            onChange={(e) => setReason(e.currentTarget.value as ReportReason)}
            class="rounded-md border border-white/10 bg-[#15151f] px-1 py-0.5 text-[10px]"
          >
            <For each={REPORT_REASONS}>
              {(r) => <option value={r.value}>{r.label}</option>}
            </For>
          </select>
          <button
            type="button"
            disabled={reportTemplate.isLoading()}
            onClick={() => void submitReport()}
            class="rounded-md border border-[#ff8787]/30 px-2 py-0.5 text-[10px] font-bold text-[#ff8787] disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </Show>

      <Show when={error()}>
        {(message) => (
          <p class="px-2 pb-2 text-[10px] text-[#ff8787]">{message()}</p>
        )}
      </Show>

      <ConfirmDialog
        open={confirming() !== null}
        title={
          confirming() === "remove" ? "Remove template?" : "Delete template?"
        }
        description={
          confirming() === "remove"
            ? "This removes the template from the library. You can undo briefly."
            : "This removes your template from the library. You can undo briefly."
        }
        confirmLabel={confirming() === "remove" ? "Remove" : "Delete"}
        danger
        busy={busy()}
        onConfirm={() => void confirmDestroy()}
        onCancel={() => setConfirming(null)}
      />
    </article>
  );
}
