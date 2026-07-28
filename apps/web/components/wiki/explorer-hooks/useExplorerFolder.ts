"use client";

import type { FolderRow } from "@/lib/pages/folder-projects";
import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo, useRef } from "react";

/**
 * Wiki Explorer folder navigation: current folder is the source-of-truth in
 * the URL (`?folder=<id>`), and an in-memory stack drives the top-bar back
 * and forward chevrons. Browser history keeps working via nuqs URL sync, so a
 * deep link + reload always lands on the right folder.
 */
export interface UseExplorerFolderResult {
  folderId: string | null;
  setFolderId: (next: string | null) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  ancestry: FolderRow[];
}

/**
 * In-memory chevron history. `last` mirrors the folder id we believe the URL
 * holds; `past`/`future` back the top-bar back/forward chevrons.
 */
export interface ExplorerHistoryStack {
  past: (string | null)[];
  future: (string | null)[];
  last: string | null;
}

/**
 * Re-sync the in-memory chevron stack with the URL-derived folder id after an
 * EXTERNAL history change (browser Back/Forward, manual URL edit). nuqs syncs
 * the `?folder` param on popstate, but the stack would otherwise keep trusting
 * its own bookkeeping — leaving `last` stale so the "already at this folder"
 * guard in `setFolderId` rejects the next click (drill-down goes inert).
 *
 * Pure and exported for unit tests. Mutates `s` in place; no-op when already
 * in sync (including echoes of our own `setFolderId`/`goBack`/`goForward`,
 * which update `last` before the URL round-trips).
 */
export function syncExplorerHistory(s: ExplorerHistoryStack, folderId: string | null): void {
  if (s.last === folderId) return;
  if (s.past.length > 0 && s.past[s.past.length - 1] === folderId) {
    // Looks like a browser Back: mirror goBack so the forward chevron works.
    s.past.pop();
    s.future.push(s.last);
  } else if (s.future.length > 0 && s.future[s.future.length - 1] === folderId) {
    // Looks like a browser Forward: mirror goForward.
    s.future.pop();
    s.past.push(s.last);
  } else {
    // Arbitrary jump (multi-step Back, manual URL edit): treat as a push.
    s.past.push(s.last);
    s.future = [];
  }
  s.last = folderId;
}

export function useExplorerFolder(folders: FolderRow[]): UseExplorerFolderResult {
  // `history: "push"` so every folder navigation adds a browser history entry
  // (nuqs default is replaceState). Without it, drilling into a folder
  // overwrites the /wiki root entry and browser Back skips past the wiki.
  const [raw, setRaw] = useQueryState(
    "folder",
    parseAsString.withDefault("").withOptions({ history: "push" })
  );
  const currentRaw = raw && raw.length > 0 ? raw : null;

  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f] as const)), [folders]);
  const folderId = currentRaw && byId.has(currentRaw) ? currentRaw : null;

  // History stack: past + future, keyed by the same value we write to the URL
  // (null for the top level). We MUST NOT re-push on nuqs echoes, so we compare
  // against the last-pushed id via a ref rather than triggering an effect chain.
  const stackRef = useRef<ExplorerHistoryStack & { initialized: boolean }>({
    past: [],
    future: [],
    last: folderId,
    initialized: false,
  });

  if (!stackRef.current.initialized) {
    stackRef.current.last = folderId;
    stackRef.current.initialized = true;
  }

  // Browser Back/Forward (popstate) changes the URL param without going
  // through setFolderId/goBack/goForward. Re-sync the stack from the URL so
  // `last` never goes stale (a stale `last` made drill-down inert after Back).
  syncExplorerHistory(stackRef.current, folderId);

  const setFolderId = useCallback(
    (next: string | null) => {
      const s = stackRef.current;
      if (s.last === next) return;
      s.past.push(s.last);
      s.future = [];
      s.last = next;
      void setRaw(next ?? "");
    },
    [setRaw]
  );

  const goBack = useCallback(() => {
    const s = stackRef.current;
    if (s.past.length === 0) return;
    const prev = s.past.pop() ?? null;
    s.future.push(s.last);
    s.last = prev;
    void setRaw(prev ?? "");
  }, [setRaw]);

  const goForward = useCallback(() => {
    const s = stackRef.current;
    if (s.future.length === 0) return;
    const next = s.future.pop() ?? null;
    s.past.push(s.last);
    s.last = next;
    void setRaw(next ?? "");
  }, [setRaw]);

  // Rebuild ancestry (root -> current) whenever folders or folderId change.
  const ancestry = useMemo(() => {
    if (!folderId) return [] as FolderRow[];
    const chain: FolderRow[] = [];
    const seen = new Set<string>();
    let cur: string | null = folderId;
    while (cur && !seen.has(cur)) {
      const row = byId.get(cur);
      if (!row) break;
      seen.add(cur);
      chain.unshift(row);
      cur = row.parentId;
    }
    return chain;
  }, [byId, folderId]);

  const s = stackRef.current;
  return {
    folderId,
    setFolderId,
    canGoBack: s.past.length > 0,
    canGoForward: s.future.length > 0,
    goBack,
    goForward,
    ancestry,
  };
}
