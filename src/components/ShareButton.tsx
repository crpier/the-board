import { Check, Share2 } from "lucide-solid";
import { Show, createSignal } from "solid-js";
import { env } from "~/env";

/**
 * Copy-link / share action (#64), used on both the feed card and the detail
 * page (they share `MemeCard`, which renders this).
 *
 * The link points at the Convex http action (`convex/http.ts`), not the bare
 * SPA route: the app is CSR-only (ADR 0002) and never server-renders
 * `/meme/:id`, so that's the only URL with server-rendered `og:*`/`twitter:*`
 * tags for Discord/Slack/WhatsApp to unfurl. Opening the link redirects to the
 * real app route immediately.
 *
 * Prefers the native share sheet (`navigator.share`, mostly mobile) and falls
 * back to a clipboard copy with inline "Copied!" feedback.
 */
export function ShareButton(props: { memeId: string; title?: string }) {
  const [copied, setCopied] = createSignal(false);
  const shareUrl = () => `${env.VITE_CONVEX_SITE_URL}/meme/${props.memeId}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions/insecure context) — no further
      // fallback; the link is still visible/selectable via the browser bar.
    }
  }

  async function onShare() {
    const url = shareUrl();
    if (navigator.share) {
      try {
        await navigator.share({
          title: props.title ?? "Meme · The Board",
          url,
        });
        return;
      } catch {
        // Cancelled or unsupported mid-call — fall back to clipboard copy.
      }
    }
    await copyLink();
  }

  return (
    <button
      type="button"
      onClick={() => void onShare()}
      class="flex items-center gap-1 text-[11px] text-[#6a6a7e] transition-colors hover:text-[#63e6be]"
    >
      <Show
        when={copied()}
        fallback={<Share2 class="h-3.5 w-3.5" aria-hidden="true" />}
      >
        <Check class="h-3.5 w-3.5" aria-hidden="true" />
      </Show>
      {copied() ? "Copied!" : "Share"}
    </button>
  );
}
