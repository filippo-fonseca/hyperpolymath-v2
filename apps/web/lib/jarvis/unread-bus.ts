/**
 * JARVIS unread-message bus (issue #149).
 *
 * Module-level pub-sub for the count of JARVIS assistant replies that arrived
 * while the user was NOT actively viewing the conversation. Mirrors the
 * mic-state-bus pattern (plain Set, no store library — single-user MVP).
 *
 * "Unread" semantics:
 *   - A reply is unread when it COMPLETES (onDone / response-end) while the
 *     user is not viewing the JARVIS conversation.
 *   - "Viewing the conversation" = a JarvisConsole is mounted (either /today
 *     or the split-screen side panel) AND the document is visible. While
 *     viewing, bumps are no-ops and the count is held at zero.
 *
 * Two presentations, both driven from here:
 *   1. In-app badge on the JARVIS tab (TopTabBar) — subscribes to the count.
 *   2. Browser-tab title prefix "(N) …" — updated here directly, gated by
 *      document.visibilityState so it only marks the tab when backgrounded.
 *      document.title is the most broadly-supported "tab badge" technique;
 *      the favicon-canvas approach degrades poorly across browsers, so the
 *      title prefix is the graceful baseline.
 *
 * SSR-safe: every DOM touch is guarded by `typeof document`/`window` checks so
 * importing this module never throws during server render.
 */

let unreadCount = 0;

/**
 * Refcount of mounted JarvisConsole instances. The console can be mounted in
 * up to two places at once (the /today route AND the split-screen side panel),
 * so a boolean would be clobbered when one unmounts while the other stays.
 */
let consoleMountCount = 0;

const subscribers = new Set<(count: number) => void>();

/** Original document.title, captured before we ever prefix it. */
let baseTitle: string | null = null;

function isDocumentVisible(): boolean {
  if (typeof document === "undefined") return true;
  // `visibilityState` is universally supported in evergreen browsers; treat an
  // unknown value as visible (fail-open — better to under-count than spam).
  return document.visibilityState !== "hidden";
}

/** True when a console is mounted AND the tab is in the foreground. */
function isViewing(): boolean {
  return consoleMountCount > 0 && isDocumentVisible();
}

/**
 * Sync the browser-tab title prefix to the current count. Adds "(N) " when
 * there are unread messages, strips it when the count is zero. Captures the
 * pristine title on first use so toggling on/off is lossless.
 */
function syncDocumentTitle(): void {
  if (typeof document === "undefined") return;

  // Strip any existing "(N) " prefix to recover the canonical base title. This
  // also tolerates the title being changed elsewhere (e.g. route navigation)
  // between syncs — we always rebuild from the un-prefixed form.
  const stripped = document.title.replace(/^\(\d+\)\s+/, "");
  if (baseTitle === null || stripped.length > 0) {
    baseTitle = stripped;
  }
  const base = baseTitle ?? "";

  document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
}

function emit(): void {
  subscribers.forEach((fn) => fn(unreadCount));
  syncDocumentTitle();
}

/**
 * Subscribe to unread-count changes. Fires immediately with the current count
 * and returns an unsubscribe function.
 */
export function subscribeToUnread(fn: (count: number) => void): () => void {
  subscribers.add(fn);
  fn(unreadCount);
  return () => {
    subscribers.delete(fn);
  };
}

export function getUnreadCount(): number {
  return unreadCount;
}

/**
 * Record that a JARVIS assistant reply completed. Increments the unread count
 * only when the user is NOT currently viewing the conversation; otherwise it's
 * a no-op (they're looking right at it).
 */
export function bumpUnread(): void {
  if (isViewing()) return;
  unreadCount += 1;
  emit();
}

/** Force the count back to zero (e.g. the user opened the conversation). */
export function clearUnread(): void {
  if (unreadCount === 0) return;
  unreadCount = 0;
  emit();
}

/**
 * Register/unregister a mounted JarvisConsole. When the first console mounts
 * (and the tab is visible) the count clears, since the user is now looking at
 * the conversation. Returns an unregister fn for effect cleanup.
 */
export function registerConsoleViewing(): () => void {
  consoleMountCount += 1;
  if (isViewing()) clearUnread();
  return () => {
    consoleMountCount = Math.max(0, consoleMountCount - 1);
  };
}

/**
 * Wire the Page Visibility listener once. When the tab returns to the
 * foreground while a console is mounted, the user is now viewing the
 * conversation, so the count resets. Idempotent — safe to call from multiple
 * mounts; only the first attaches the listener.
 */
let visibilityBound = false;
export function ensureVisibilityListener(): void {
  if (visibilityBound || typeof document === "undefined") return;
  visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (isViewing()) clearUnread();
  });
}
