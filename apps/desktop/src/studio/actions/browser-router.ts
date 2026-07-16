// apps/desktop/src/studio/actions/browser-router.ts
// Single owner of "open this URL in the in-app browser widget". Three call
// sites feed into here so a single "is England winning" turn never opens the
// same page twice:
//
//   1. materialize.ts       — a tool result carrying an open_url/web_search URL.
//   2. studio-action-router — a `studio_open_widget` studio-action (browser).
//   3. main.ts (dispatcher) — the open_url tool-call fallback path.
//
// TWO dedupe layers stack here:
//
//   A. PER-TURN LRU (turnId, normalized url). A turn's opened-URL set is kept
//      only for the most recent few turns (a tiny LRU) so overlapping
//      routine/normal turns don't collide while memory stays bounded. This is
//      the original layer; its semantics are preserved verbatim.
//
//   B. CROSS-TURN RECENCY WINDOW (normalized url → last-opened timestamp),
//      independent of turnId. One spoken query can fan out into TWO server
//      turns (a wake-probe rolling-transcript tail firing an utterance-routine
//      on a partial phrase while the full utterance starts a normal turn), and
//      the studio-action path carries no turnId at all (it lands in a separate
//      bucket from the tool-call path). Both cases slip past layer A because
//      the turnId keys differ. Layer B suppresses a summon for any URL opened
//      within the last WINDOW_MS regardless of turnId, so the two-turn / no-turn
//      double-open collapses to one widget. The window is short enough that a
//      user DELIBERATELY re-opening the same page a minute later still works.

import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { summonWidget } from "../state/widget-windows";
import { WIDGET_CATALOG } from "../windows/catalog";

/** Set once Studio has mounted; used to gate open_url → widget routing. */
let studioAvailable = false;

/** Mark the Studio canvas as available (called from the bridge on start). */
export function markStudioAvailable(): void {
  studioAvailable = true;
}

/** Whether the Studio canvas is mounted and can host a browser widget. */
export function isStudioAvailable(): boolean {
  return studioAvailable;
}

// ── Layer A: per-turn LRU ────────────────────────────────────────────────────
// Bounded LRU of turnId → set of URLs already opened this turn. A handful of
// concurrent turns is the realistic ceiling (routine opener + brief + a normal
// turn); keep the last 8 so it never grows unbounded across a long session.
const MAX_TURNS = 8;
const openedByTurn = new Map<string, Set<string>>();

/** Fallback bucket for callers with no turnId (defensive; still deduped). */
const NO_TURN = "__no_turn__";

// ── Layer B: cross-turn recency window ───────────────────────────────────────
// A single spoken query can produce two server turns (or a turn-less
// studio-action alongside a tool-call), so per-turn buckets alone let the same
// URL through twice. This map records, per normalized URL, when it was last
// summoned; a repeat inside WINDOW_MS is suppressed no matter the turnId.
//
// 15s comfortably spans the gap between a wake-probe partial turn and the full
// utterance's normal turn (sub-second to a few seconds in practice), yet is far
// below the "user deliberately reopens the same page" horizon (tens of seconds
// to minutes), so intentional re-opens still work. Two genuinely different URLs
// never collide: the key is the fully-normalized href (query string included),
// so distinct search queries (?q=…) and distinct pages stay distinct.
const WINDOW_MS = 15_000;
// Cap the recency map so a long session can't grow it unbounded. Realistically
// only a few distinct URLs are in flight within any 15s window; 64 is generous.
const MAX_RECENT = 64;
const recentByUrl = new Map<string, number>();

/** Injectable clock so tests can advance time deterministically. */
let now: () => number = () => Date.now();

/** Test hook: override the clock used by the cross-turn recency window. */
export function __setBrowserRouterClock(fn: () => number): void {
  now = fn;
}

function bucketFor(turnId: string | undefined): Set<string> {
  const key = turnId && turnId.length > 0 ? turnId : NO_TURN;
  let set = openedByTurn.get(key);
  if (!set) {
    set = new Set<string>();
    openedByTurn.set(key, set);
    // Evict the oldest turn once we exceed the cap (Map preserves insert order).
    if (openedByTurn.size > MAX_TURNS) {
      const oldest = openedByTurn.keys().next().value;
      if (oldest !== undefined) openedByTurn.delete(oldest);
    }
  }
  return set;
}

/**
 * Normalize so trivially-different spellings of the same page dedupe. Query
 * strings are PRESERVED deliberately: two different search queries
 * (…/search?q=a vs …/search?q=b) are two different pages and must each get
 * their own widget. `URL.href` canonicalizes host casing, default ports, and a
 * bare-origin trailing slash, which is exactly the "same page, different
 * spelling" collapse we want without discarding meaningful query params.
 */
function normalize(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url.trim();
  }
}

/**
 * True if `key` was summoned within the last WINDOW_MS. Side-effect free reads;
 * also opportunistically prunes stale entries so the map stays bounded.
 */
function seenRecently(key: string): boolean {
  const at = recentByUrl.get(key);
  return at !== undefined && now() - at < WINDOW_MS;
}

/** Record `key` as just-summoned and keep the recency map bounded. */
function markRecent(key: string): void {
  const t = now();
  recentByUrl.set(key, t);
  if (recentByUrl.size > MAX_RECENT) {
    // Drop expired entries first; if still over cap, evict oldest by insertion.
    for (const [k, at] of recentByUrl) {
      if (t - at >= WINDOW_MS) recentByUrl.delete(k);
    }
    while (recentByUrl.size > MAX_RECENT) {
      const oldest = recentByUrl.keys().next().value;
      if (oldest === undefined) break;
      recentByUrl.delete(oldest);
    }
  }
}

/**
 * Record that `url` was opened in the browser widget for `turnId` WITHOUT
 * summoning anything. Used by the studio-action path so a later open_url
 * tool-call for the same page is suppressed — both via the per-turn bucket
 * (when a turnId is available) and via the cross-turn recency window (the
 * backstop for the turn-less studio-action path).
 */
export function noteBrowserUrl(url: string, turnId?: string): void {
  const key = normalize(url);
  bucketFor(turnId).add(key);
  markRecent(key);
}

/**
 * Open `url` in a browser widget, deduped. Returns true if a widget was
 * summoned, false if it was suppressed as a duplicate (no-op). Suppression
 * fires when EITHER the same URL was already opened this turn (per-turn LRU) OR
 * the same URL was summoned within the cross-turn recency window.
 */
export function openBrowserUrl(url: string, turnId?: string): boolean {
  const key = normalize(url);
  const bucket = bucketFor(turnId);
  if (bucket.has(key) || seenRecently(key)) {
    // Refresh both dedupe records so a rapid third hit is still suppressed and
    // the recency window is measured from the most recent attempt.
    bucket.add(key);
    markRecent(key);
    return false;
  }
  bucket.add(key);
  markRecent(key);
  const entry = WIDGET_CATALOG.browser;
  summonWidget("browser", { url }, undefined, {
    defaultSize: entry.defaultSize,
    singleton: entry.singleton,
  });
  return true;
}

/**
 * Tauri event fired by `studio_webview.rs` when a page inside a promoted child
 * webview requests a popup (`window.open`, `target="_blank"`, …). The Rust side
 * denies the unmanaged OS window; we reopen the URL here as a managed browser
 * widget. Keep the name in sync with `STUDIO_WEBVIEW_POPUP_EVENT` in Rust.
 */
export const STUDIO_WEBVIEW_POPUP_EVENT = "studio://webview-popup";

interface WebviewPopupPayload {
  /** The child webview label (== widget id) the popup came from. */
  source: string;
  /** The requested popup URL. */
  url: string;
}

let popupUnlisten: UnlistenFn | null = null;

/**
 * Route child-webview popups into managed browser widgets. Subscribes to the
 * `studio://webview-popup` Tauri event and hands each requested URL to
 * `openBrowserUrl` (which spawns/reuses a browser widget). Idempotent: a second
 * call is a no-op while a listener is already attached. Returns an unlisten fn.
 *
 * The popup carries no turn context, so it opens under the `NO_TURN` dedupe
 * bucket AND passes through the cross-turn recency window: a page firing the
 * same `window.open` twice in a row (or re-opening a URL a turn just opened) is
 * suppressed, while a genuinely new popup URL still summons a widget.
 */
export function wireStudioWebviewPopups(): () => void {
  if (popupUnlisten) return () => undefined;
  let disposed = false;
  void listen<WebviewPopupPayload>(STUDIO_WEBVIEW_POPUP_EVENT, (event) => {
    const url = event.payload?.url;
    if (typeof url !== "string" || url.length === 0) return;
    openBrowserUrl(url);
  })
    .then((unlisten) => {
      if (disposed) {
        unlisten();
        return;
      }
      popupUnlisten = unlisten;
    })
    .catch(() => undefined);
  return () => {
    disposed = true;
    if (popupUnlisten) {
      popupUnlisten();
      popupUnlisten = null;
    }
  };
}

/**
 * Test hook: clear all router state — studio flag, both dedupe layers
 * (per-turn LRU + cross-turn recency window), the injectable clock, and the
 * popup listener.
 */
export function __resetBrowserRouter(): void {
  studioAvailable = false;
  openedByTurn.clear();
  recentByUrl.clear();
  now = () => Date.now();
  if (popupUnlisten) {
    popupUnlisten();
    popupUnlisten = null;
  }
}
