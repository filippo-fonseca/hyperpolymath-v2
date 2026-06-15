"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sidebar-area-collapsed";
const EVENT_NAME = "sidebar-area-collapsed-change";

type CollapsedMap = Record<string, boolean>;

function readStorage(): CollapsedMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: CollapsedMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "boolean" && v) out[k] = true;
    }
    return out;
  } catch {
    return {};
  }
}

function writeStorage(next: CollapsedMap) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable — fall through.
  }
}

/**
 * useAreaCollapsed — per-area collapsed state for the sidebar tree.
 *
 * Only the collapsed entries are stored; absence means expanded (the
 * default), so storage scales with how many areas the user has actually
 * hidden rather than with the total number of areas. Subscribers stay in
 * sync via a window CustomEvent — same pattern as useSplitScreen.
 */
export function useAreaCollapsed(): {
  isCollapsed: (areaId: string) => boolean;
  toggle: (areaId: string) => void;
} {
  const [map, setMap] = useState<CollapsedMap>({});

  useEffect(() => {
    setMap(readStorage());

    function onChange(e: Event) {
      const next = (e as CustomEvent<CollapsedMap>).detail ?? {};
      setMap(next);
    }
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);

  const toggle = useCallback((areaId: string) => {
    setMap((prev) => {
      const next: CollapsedMap = { ...prev };
      if (next[areaId]) delete next[areaId];
      else next[areaId] = true;
      writeStorage(next);
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
      return next;
    });
  }, []);

  const isCollapsed = useCallback((areaId: string) => !!map[areaId], [map]);

  return { isCollapsed, toggle };
}
