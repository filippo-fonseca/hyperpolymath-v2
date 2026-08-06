// "Realtime-enough" data hook for the device CRUD screens. Mobile has no
// Supabase session (bearer auth only), so instead of Postgres changefeeds we
// refetch aggressively: on tab focus, on app foreground, every 30s while
// visible, and whenever JARVIS executes a tool (the SSE stream already tells
// the app — Home emits onto the invalidation bus below).

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

type Listener = () => void;
const listeners = new Set<Listener>();

/** Fired by Home whenever a JARVIS tool-call lands (data likely changed). */
export function emitDataInvalidate(): void {
  for (const fn of listeners) fn();
}

/** Subscribe to JARVIS / data invalidation (e.g. to refresh home-screen widgets). */
export function onDataInvalidate(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const POLL_MS = 30_000;

export function useCollection<T>(
  fetcher: () => Promise<T | null>,
  active: boolean,
): {
  data: T | null;
  loading: boolean;
  /**
   * True when the most recent fetch failed (the fetcher returned null: any
   * non-2xx, network error, or timeout). Stays false while data is present so
   * a transient poll failure never nukes already-shown content — screens only
   * surface the error state when there is nothing else to show (`error && !data`).
   */
  error: boolean;
  refresh: () => Promise<void>;
  /** Apply an optimistic local mutation immediately. */
  mutate: (update: (current: T | null) => T | null) => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const activeRef = useRef(active);
  activeRef.current = active;
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const next = await fetcherRef.current();
      if (next !== null) {
        setData(next);
        setError(false);
      } else {
        // Fetcher signalled failure (null). Surface an error; keep any prior
        // data so a failed background poll doesn't blank the screen.
        setError(true);
      }
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  // On becoming active (tab focus).
  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  // Foreground + JARVIS invalidation + polling while visible.
  useEffect(() => {
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active" && activeRef.current) void refresh();
    });
    const onInvalidate = () => {
      if (activeRef.current) void refresh();
    };
    listeners.add(onInvalidate);
    const interval = setInterval(() => {
      if (activeRef.current) void refresh();
    }, POLL_MS);
    return () => {
      appSub.remove();
      listeners.delete(onInvalidate);
      clearInterval(interval);
    };
  }, [refresh]);

  const mutate = useCallback((update: (current: T | null) => T | null) => {
    setData((current) => update(current));
  }, []);

  return { data, loading, error, refresh, mutate };
}
