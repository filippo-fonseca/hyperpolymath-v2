// apps/desktop/src/hud/notification-toast.ts
//
// The incoming-message toast renderer: a compact glass panel near the orb for
// each announced WhatsApp/iMessage message. Presentational only — mirrors the
// background-tasks chip idiom (lazy container, imperative append, self-timed
// fade-out). The announcer (notification-announcer.ts) owns the WHEN + the TTS
// + the open-widget side effect; this owns only the panel.
//
// A toast reads "WhatsApp · Rohan: first ~80 chars…" (or a "5 new messages"
// summary for a collapsed storm). It lingers, fades, and removes itself.

/** How long a toast stays fully visible before it fades out. */
const LINGER_MS = 5_200;
/** Fade duration — must match the CSS `.noti-toast` opacity transition. */
const FADE_MS = 420;

const CONTAINER_ID = "notification-toasts";

/** Minimal HTML escape — sender + preview are untrusted message content. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Lazily create/mount the stacking container for the toasts. */
function ensureContainer(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(CONTAINER_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = CONTAINER_ID;
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  return el;
}

/**
 * Show one notification toast near the orb and schedule its own fade-out.
 * No-op off-DOM (tests / non-Tauri). Each call appends an independent panel, so
 * concurrent announcements stack rather than clobbering one another.
 */
export function showNotificationToast(args: {
  channel: string;
  sender: string;
  preview: string;
}): void {
  const container = ensureContainer();
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "noti-toast";
  toast.innerHTML =
    `<span class="noti-channel" aria-hidden="true">${escapeHtml(args.channel)}</span>` +
    `<span class="noti-sender">${escapeHtml(args.sender)}</span>` +
    `<span class="noti-preview">${escapeHtml(args.preview)}</span>`;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.dataset.leaving = "true";
    window.setTimeout(() => toast.remove(), FADE_MS);
  }, LINGER_MS);
}
