import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { FeedMeme } from "@convex/memes";
import type { ReportReason } from "@convex/validators";
import { A } from "@solidjs/router";
import { Flag, Shield } from "lucide-solid";
import { For, Show, createSignal, untrack } from "solid-js";
import {
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
} from "date-fns";
import { VoteControl } from "~/components/VoteControl";
import { useConvexAuth } from "~/lib/convex-auth-solid";
import { useAction, useMutation, useQuery } from "~/lib/convex-solid";

type Meme = FeedMeme;
type Visibility = FeedMeme["visibility"];

function formatTimeAgo(creationTime: number): string {
  const date = new Date(creationTime);
  const minutes = differenceInMinutes(new Date(), date);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = differenceInHours(new Date(), date);
  if (hours < 24) return `${hours}h ago`;

  const days = differenceInDays(new Date(), date);
  return `${days}d ago`;
}

/**
 * Structural split only (commas); canonicalization — trim, lowercase, de-dupe —
 * is the server's job (`canonicalizeTags`), matching the upload form.
 */
function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function MemeCard(props: {
  meme: Meme;
  /** Called after a successful delete so the parent can drop the card. */
  onDeleted?: (id: Id<"memes">) => void;
}) {
  const [editing, setEditing] = createSignal(false);
  const [reporting, setReporting] = createSignal(false);
  const detailHref = () => `/meme/${props.meme._id}`;

  return (
    <article class="overflow-hidden rounded-2xl border border-white bg-gradient-to-b">
      {/* ── Title (when present) ── */}
      <Show when={props.meme.title}>
        {(title) => (
          <div class="px-4 pt-4 pb-2">
            <h2 class="font-display text-center text-lg font-bold text-white">
              <A
                href={detailHref()}
                class="transition-colors hover:text-[#63e6be]"
              >
                {title()}
              </A>
            </h2>
          </div>
        )}
      </Show>

      {/* ── Media ── */}
      <Show
        when={props.meme.mediaType !== "video"}
        fallback={
          <video
            class="w-full bg-black"
            controls
            preload="metadata"
            src={props.meme.mediaUrl}
          />
        }
      >
        <img
          class="w-full"
          src={props.meme.mediaUrl}
          alt={props.meme.title ?? "Meme"}
        />
      </Show>

      {/* ── Footer ── */}
      <div class="space-y-2 px-4 pt-2.5 pb-3">
        {/* Tags */}
        <Show when={props.meme.tags.length > 0}>
          <div class="flex flex-wrap gap-x-2 gap-y-1">
            <For each={props.meme.tags}>
              {(tag) => (
                // A tag is a search term: clicking it runs `/search?q=<tag>`.
                // The card is shared, so this makes tags clickable in the feed,
                // detail, and results at once; in results the URL `q` change
                // just re-runs the search.
                <A
                  href={`/search?q=${encodeURIComponent(tag)}`}
                  class="text-xs text-[#5a5a6e] transition-colors hover:text-[#63e6be]"
                >
                  #{tag}
                </A>
              )}
            </For>
          </div>
        </Show>

        {/* Actions + meta row */}
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <VoteControl
            memeId={props.meme._id}
            initialUpvoteCount={props.meme.upvoteCount}
            initialDownvoteCount={props.meme.downvoteCount}
          />

          {/* Owner-only edit/delete, gated on the server-computed flag */}
          <Show when={props.meme.isOwner}>
            <OwnerControls
              meme={props.meme}
              editing={editing()}
              onEdit={() => setEditing(true)}
              onDeleted={props.onDeleted}
            />
          </Show>

          {/* Admin moderation: visibility toggle on someone else's meme (#56).
              Owners moderate their own memes through the regular edit form, so
              the control is hidden for them to avoid two visibility toggles. */}
          <Show when={props.meme.canModerate && !props.meme.isOwner}>
            <ModerationControls meme={props.meme} />
          </Show>

          {/* Report: signed-in non-owners only (#67). Owners already control
              their own memes; reporting your own post isn't a real flow. */}
          <Show when={!props.meme.isOwner}>
            <ReportButton
              meme={props.meme}
              reporting={reporting()}
              onReport={() => setReporting(true)}
            />
          </Show>

          {/* Author profile + time permalink — pushed to the right when the row
              fits on one line, wraps onto its own line (and breaks long
              usernames) otherwise so it can never force horizontal scroll */}
          <span class="ml-auto max-w-full text-[11px] break-words text-[#6a6a7e]">
            <A
              href={props.meme.authorProfileHref}
              class="transition-colors hover:text-[#63e6be]"
            >
              @{props.meme.authorName}
            </A>{" "}
            &middot;{" "}
            <A
              href={detailHref()}
              class="transition-colors hover:text-[#63e6be]"
            >
              {formatTimeAgo(props.meme._creationTime)}
            </A>
          </span>
        </div>

        {/* Inline edit form */}
        <Show when={props.meme.isOwner && editing()}>
          <EditForm meme={props.meme} onClose={() => setEditing(false)} />
        </Show>

        {/* Inline report form */}
        <Show when={!props.meme.isOwner && reporting()}>
          <ReportForm meme={props.meme} onClose={() => setReporting(false)} />
        </Show>
      </div>
    </article>
  );
}

function OwnerControls(props: {
  meme: Meme;
  editing: boolean;
  onEdit: () => void;
  onDeleted?: (id: Id<"memes">) => void;
}) {
  const deleteMeme = useAction(api.memes.deleteMeme);
  const [error, setError] = createSignal<string | null>(null);

  async function onDelete() {
    if (deleteMeme.isLoading()) return;
    if (!confirm("Delete this meme? This can't be undone.")) return;
    setError(null);
    try {
      await deleteMeme.mutate({ memeId: props.meme._id });
      props.onDeleted?.(props.meme._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  return (
    <div class="flex items-center gap-2 text-[11px]">
      <button
        type="button"
        disabled={props.editing}
        onClick={() => props.onEdit()}
        class="text-[#6a6a7e] transition-colors hover:text-[#63e6be] disabled:opacity-50"
      >
        Edit
      </button>
      <button
        type="button"
        disabled={deleteMeme.isLoading()}
        onClick={() => void onDelete()}
        class="text-[#6a6a7e] transition-colors hover:text-[#ff8787] disabled:opacity-50"
      >
        {deleteMeme.isLoading() ? "Deleting…" : "Delete"}
      </button>
      <Show when={error()}>
        {(message) => <span class="text-[#ff8787]">{message()}</span>}
      </Show>
    </div>
  );
}

/**
 * Admin-only visibility toggle, rendered on memes the viewer doesn't own when
 * the server-computed `canModerate` flag is set (#56). The shield icon marks it
 * as a moderation action, distinct from the owner's edit controls. The pressed
 * state reads `props.meme.visibility` directly — the reactive query is the
 * source of truth, so a successful flip updates it (and, in the public feed,
 * drops the now-private card) without local state.
 */
function ModerationControls(props: { meme: Meme }) {
  const moderateMeme = useMutation(api.memes.moderateMeme);
  const [error, setError] = createSignal<string | null>(null);

  async function onModerate(visibility: Visibility) {
    if (moderateMeme.isLoading() || visibility === props.meme.visibility)
      return;
    setError(null);
    try {
      await moderateMeme.mutate({ memeId: props.meme._id, visibility });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Moderation failed.");
    }
  }

  return (
    <div class="flex items-center gap-1.5 text-[11px]">
      {/* Decorative shield; the group's aria-label carries the meaning. */}
      <Shield class="h-3.5 w-3.5 text-[#ffd43b]" aria-hidden="true" />
      <div
        class="inline-flex rounded-md border border-[#ffd43b]/25 p-0.5"
        role="group"
        aria-label="Moderation: visibility"
      >
        <For each={["public", "private"] as const}>
          {(option) => (
            <button
              type="button"
              aria-pressed={props.meme.visibility === option}
              disabled={moderateMeme.isLoading()}
              onClick={() => void onModerate(option)}
              class={`rounded px-2 py-0.5 text-[11px] font-bold capitalize transition disabled:opacity-50 ${
                props.meme.visibility === option
                  ? "bg-[#ffd43b]/10 text-[#ffd43b]"
                  : "text-[#5a5a6e] hover:text-[#ffd43b]"
              }`}
            >
              {option}
            </button>
          )}
        </For>
      </div>
      <Show when={error()}>
        {(message) => <span class="text-[#ff8787]">{message()}</span>}
      </Show>
    </div>
  );
}

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "hate_speech", label: "Hate speech" },
  { value: "illegal_content", label: "Illegal content" },
  { value: "other", label: "Other" },
];

/**
 * The report entry point on a card: a small flag button that opens
 * `ReportForm` below the footer (#67), mirroring `OwnerControls`' edit
 * button. Signed-out viewers see nothing — unlike voting, there's no
 * disabled-with-tooltip state, since reporting isn't a core browsing action
 * worth advertising to guests.
 *
 * Reads `reports.myReportStatus` to disable itself (and relabel to
 * "Reported") once the viewer already has an open report on this meme —
 * the same read-your-own-state shape `VoteControl` uses for `myVote`. This
 * is a UX nicety only; `createReport` re-enforces the same rule server-side.
 */
function ReportButton(props: {
  meme: Meme;
  reporting: boolean;
  onReport: () => void;
}) {
  const auth = useConvexAuth()!;
  const status = useQuery(
    api.reports.myReportStatus,
    () => ({ memeId: props.meme._id }),
    () => ({ enabled: auth.isAuthenticated() }),
  );
  const alreadyReported = () => status.data() === "open";

  return (
    <Show when={auth.isAuthenticated()}>
      <button
        type="button"
        disabled={props.reporting || alreadyReported()}
        title={
          alreadyReported()
            ? "You already reported this meme"
            : "Report this meme"
        }
        onClick={() => props.onReport()}
        class="flex items-center gap-1 text-[11px] text-[#6a6a7e] transition-colors hover:text-[#ff8787] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Flag class="h-3.5 w-3.5" aria-hidden="true" />
        {alreadyReported() ? "Reported" : "Report"}
      </button>
    </Show>
  );
}

/**
 * The reason + optional-details form a report button expands into. Submits
 * `reports.createReport`; a duplicate-open-report attempt surfaces the
 * server's message inline rather than being pre-empted client-side, since
 * `myReportStatus` (driving the button's disabled state) can be a beat stale.
 */
function ReportForm(props: { meme: Meme; onClose: () => void }) {
  const createReport = useMutation(api.reports.createReport);
  const [reason, setReason] = createSignal<ReportReason>("spam");
  const [details, setDetails] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (createReport.isLoading()) return;
    setError(null);
    try {
      await createReport.mutate({
        memeId: props.meme._id,
        reason: reason(),
        details: details().trim() || undefined,
      });
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report failed.");
    }
  }

  return (
    <form
      class="space-y-3 rounded-xl border border-[#ff8787]/20 p-3"
      onSubmit={onSubmit}
    >
      <div>
        <label
          for={`report-reason-${props.meme._id}`}
          class="mb-1 block text-xs text-[#5a5a6e]"
        >
          Reason
        </label>
        <select
          id={`report-reason-${props.meme._id}`}
          value={reason()}
          disabled={createReport.isLoading()}
          onChange={(e) => setReason(e.currentTarget.value as ReportReason)}
          class="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#ff8787]/40"
        >
          <For each={REPORT_REASONS}>
            {(option) => <option value={option.value}>{option.label}</option>}
          </For>
        </select>
      </div>

      <div>
        <label
          for={`report-details-${props.meme._id}`}
          class="mb-1 block text-xs text-[#5a5a6e]"
        >
          Details <span class="text-[#5a5a6e]/60">(optional)</span>
        </label>
        <textarea
          id={`report-details-${props.meme._id}`}
          value={details()}
          rows={2}
          disabled={createReport.isLoading()}
          onInput={(e) => setDetails(e.currentTarget.value)}
          placeholder="Anything that helps a reviewer understand the issue"
          class="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[#5a5a6e]/50 focus:border-[#ff8787]/40"
        />
      </div>

      <Show when={error()}>
        {(message) => <p class="text-xs text-[#ff8787]">{message()}</p>}
      </Show>

      <div class="flex gap-2">
        <button
          type="submit"
          disabled={createReport.isLoading()}
          class="rounded-lg border border-[#ff8787]/30 bg-[#ff8787]/10 px-3 py-1.5 text-xs font-bold text-[#ff8787] transition disabled:opacity-50"
        >
          {createReport.isLoading() ? "Reporting…" : "Submit report"}
        </button>
        <button
          type="button"
          disabled={createReport.isLoading()}
          onClick={() => props.onClose()}
          class="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-[#5a5a6e] transition disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditForm(props: { meme: Meme; onClose: () => void }) {
  const updateMeme = useMutation(api.memes.updateMeme);

  // Seed the form once from the current meme; the form is an intentional
  // snapshot, so later prop changes shouldn't clobber in-progress edits, hence
  // the untracked reads.
  const [title, setTitle] = createSignal(untrack(() => props.meme.title ?? ""));
  const [tagsText, setTagsText] = createSignal(
    untrack(() => props.meme.tags.join(", ")),
  );
  const [visibility, setVisibility] = createSignal<Visibility>(
    untrack(() => props.meme.visibility),
  );
  const [error, setError] = createSignal<string | null>(null);

  async function onSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (updateMeme.isLoading()) return;
    setError(null);
    try {
      await updateMeme.mutate({
        memeId: props.meme._id,
        title: title().trim() || undefined,
        tags: parseTags(tagsText()),
        visibility: visibility(),
      });
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <form
      class="space-y-3 rounded-xl border border-white/10 p-3"
      onSubmit={onSubmit}
    >
      <div>
        <label
          for={`edit-title-${props.meme._id}`}
          class="mb-1 block text-xs text-[#5a5a6e]"
        >
          Title <span class="text-[#5a5a6e]/60">(optional)</span>
        </label>
        <input
          id={`edit-title-${props.meme._id}`}
          type="text"
          value={title()}
          disabled={updateMeme.isLoading()}
          onInput={(e) => setTitle(e.currentTarget.value)}
          class="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-[#63e6be]/40"
        />
      </div>

      <div>
        <label
          for={`edit-tags-${props.meme._id}`}
          class="mb-1 block text-xs text-[#5a5a6e]"
        >
          Tags <span class="text-[#5a5a6e]/60">(comma-separated)</span>
        </label>
        <input
          id={`edit-tags-${props.meme._id}`}
          type="text"
          value={tagsText()}
          disabled={updateMeme.isLoading()}
          placeholder="cats, reaction, monday"
          onInput={(e) => setTagsText(e.currentTarget.value)}
          class="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[#5a5a6e]/50 focus:border-[#63e6be]/40"
        />
      </div>

      <div>
        <span class="mb-1 block text-xs text-[#5a5a6e]">Visibility</span>
        <div
          class="inline-flex rounded-lg border border-white/10 p-1"
          role="group"
          aria-label="Visibility"
        >
          <For each={["public", "private"] as const}>
            {(option) => (
              <button
                type="button"
                aria-pressed={visibility() === option}
                disabled={updateMeme.isLoading()}
                onClick={() => setVisibility(option)}
                class={`rounded-md px-3 py-1 text-xs font-bold capitalize transition ${
                  visibility() === option
                    ? "bg-[#63e6be]/10 text-[#63e6be]"
                    : "text-[#5a5a6e]"
                }`}
              >
                {option}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={error()}>
        {(message) => <p class="text-xs text-[#ff8787]">{message()}</p>}
      </Show>

      <div class="flex gap-2">
        <button
          type="submit"
          disabled={updateMeme.isLoading()}
          class="rounded-lg border border-[#63e6be]/30 bg-[#63e6be]/10 px-3 py-1.5 text-xs font-bold text-[#63e6be] transition disabled:opacity-50"
        >
          {updateMeme.isLoading() ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={updateMeme.isLoading()}
          onClick={() => props.onClose()}
          class="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-[#5a5a6e] transition disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
