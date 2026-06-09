"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "split-screen-on";
const EVENT_NAME = "split-screen-change";

/**
 * useSplitScreen — boolean app-wide split-screen state.
 *
 * Backed by localStorage so the preference survives reload, and a custom
 * window event so multiple subscribers (AppShell + TopTabBar + hotkeys) stay
 * in sync without dragging in zustand/context just for one toggle.
 */
export function useSplitScreen(): {
  splitOn: boolean;
  setSplitOn: (next: boolean) => void;
  toggle: () => void;
} {
  const [splitOn, setSplitOnState] = useState<boolean>(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setSplitOnState(true);
    } catch {
      // localStorage unavailable — fall through with default.
    }

    function onChange(e: Event) {
      const next = (e as CustomEvent<boolean>).detail;
      setSplitOnState(Boolean(next));
    }
    window.addEventListener(EVENT_NAME, onChange);
    return () => window.removeEventListener(EVENT_NAME, onChange);
  }, []);

  const setSplitOn = useCallback((next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
    setSplitOnState(next);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
  }, []);

  const toggle = useCallback(() => {
    setSplitOn(!splitOn);
  }, [splitOn, setSplitOn]);

  return { splitOn, setSplitOn, toggle };
}

/** Read the current value imperatively (no React subscription). */
export function readSplitScreen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Imperative setter — used by global hotkey handlers. */
export function setSplitScreenImperative(next: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
}
