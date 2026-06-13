"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "tasks-expanded";
const EVENT_NAME = "tasks-expanded-change";

/**
 * useTasksExpanded — boolean app-wide "tasks fullscreen" state.
 *
 * Mirrors `useSplitScreen` exactly: backed by localStorage so the preference
 * survives reload, plus a custom window event so multiple subscribers
 * (TasksClient's toggle button + AppShell's sidebar collapse) stay in sync
 * without dragging in zustand/context just for one toggle (D-08 / UI-SPEC S-7).
 */
export function useTasksExpanded(): {
  expanded: boolean;
  setExpanded: (next: boolean) => void;
  toggle: () => void;
} {
  const [expanded, setExpandedState] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setExpandedState(true);
    } catch {
      // localStorage unavailable — fall through with default.
    }

    function onChange(e: Event) {
      const next = (e as CustomEvent<boolean>).detail;
      setExpandedState(Boolean(next));
    }
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);

  const setExpanded = useCallback((next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
    setExpandedState(next);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  }, []);

  const toggle = useCallback(() => {
    setExpanded(!expanded);
  }, [expanded, setExpanded]);

  return { expanded, setExpanded, toggle };
}

/** Read the current value imperatively (no React subscription). */
export function readTasksExpanded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
