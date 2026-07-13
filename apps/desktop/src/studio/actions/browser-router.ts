// apps/desktop/src/studio/actions/browser-router.ts
// Single owner of "open this URL in the in-app browser widget", with per-turn
// same-URL dedupe. Three call sites feed into here so a single "is England
// winning" turn never opens the same page twice:
//
//   1. materialize.ts       — a tool result carrying an open_url/web_search URL.
//   2. studio-action-router — a `studio_open_widget` studio-action (browser).
//   3. main.ts (dispatcher) — the open_url tool-call fallback path.
//
// Dedupe is keyed on (turnId, normalized url). A turn's opened-URL set is kept
// only for the most recent few turns (a tiny LRU) so overlapping routine/normal
// turns don't collide while memory stays bounded.

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

// Bounded LRU of turnId → set of URLs already opened this turn. A handful of
// concurrent turns is the realistic ceiling (routine opener + brief + a normal
// turn); keep the last 8 so it never grows unbounded across a long session.
const MAX_TURNS = 8;
const openedByTurn = new Map<string, Set<string>>();

/** Fallback bucket for callers with no turnId (defensive; still deduped). */
const NO_TURN = "__no_turn__";

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

/** Normalize so trivially-different spellings of the same page dedupe. */
function normalize(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url.trim();
  }
}

/**
 * Record that `url` was opened in the browser widget for `turnId` WITHOUT
 * summoning anything. Used by the studio-action path so a later open_url
 * tool-call for the same page is suppressed.
 */
export function noteBrowserUrl(url: string, turnId?: string): void {
  bucketFor(turnId).add(normalize(url));
}

/**
 * Open `url` in a browser widget, deduped per turn. Returns true if a widget
 * was summoned, false if the same URL was already opened this turn (no-op).
 */
export function openBrowserUrl(url: string, turnId?: string): boolean {
  const key = normalize(url);
  const bucket = bucketFor(turnId);
  if (bucket.has(key)) return false;
  bucket.add(key);
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
 * The popup has no turn context, so it opens under the `NO_TURN` dedupe bucket —
 * enough to suppress a page firing the same `window.open` twice in a row.
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

/** Test hook: clear all router state (studio flag + per-turn dedupe). */
export function __resetBrowserRouter(): void {
  studioAvailable = false;
  openedByTurn.clear();
  if (popupUnlisten) {
    popupUnlisten();
    popupUnlisten = null;
  }
}
