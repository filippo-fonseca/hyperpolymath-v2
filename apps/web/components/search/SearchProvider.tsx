"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { fetchSearchSnapshot } from "@/lib/search/actions";
import {
  buildSearchIndex,
  search,
  type SearchEntry,
  type SearchResults,
  type SearchSnapshot,
} from "@/lib/search";

const SearchIndexContext = createContext<SearchEntry[] | null>(null);

/**
 * How long a burst of Realtime writes is allowed to accumulate before the
 * snapshot is refetched. Long enough to fold one user action's several table
 * events into a single 18-query round trip, short enough that a newly created
 * task is findable by the time the user reaches for Cmd+K.
 */
const SNAPSHOT_REFETCH_DEBOUNCE_MS = 400;

/** Backstop staleness only — Realtime is the real freshness mechanism. */
const SNAPSHOT_STALE_MS = 5 * 60_000;

interface ProviderProps {
  userId: string;
  /**
   * Optional, and in practice never passed. The snapshot costs 18 of the (app)
   * layout's 25 queries and nothing at first paint needs it, so the layout no
   * longer fetches it; the client query below populates the index a moment
   * after paint and realtime keeps it fresh. The prop survives for any surface
   * that genuinely has a warm snapshot to hand over.
   */
  initialSnapshot?: SearchSnapshot;
  children: React.ReactNode;
}

/**
 * Holds the in-memory search index for the whole (app) subtree. The index is
 * rebuilt only when the snapshot reference changes (server initialData, then
 * refetch-on-focus), never on every render, satisfying the re-index contract.
 */
export function SearchProvider({ userId, initialSnapshot, children }: ProviderProps) {
  const queryClient = useQueryClient();
  const snapshotKey = useMemo(() => ["search-snapshot", userId] as const, [userId]);

  const { data } = useQuery({
    queryKey: snapshotKey,
    queryFn: fetchSearchSnapshot,
    initialData: initialSnapshot,
    // The snapshot is 18 server queries. Realtime already drives every
    // meaningful refresh below, so time-based staleness only needs to be a
    // long-interval backstop, and refocusing a tab must not re-run it: the
    // index cannot have drifted while the tab was hidden without a Realtime
    // event having fired (the QueryProvider's visibilitychange listener
    // recovers from any gap in the channel itself).
    staleTime: SNAPSHOT_STALE_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Coalesce the realtime-driven refetch. A single user action routinely
  // touches several of the tables below at once (creating a task with a
  // project link and two hashtags fires `tasks`, `tasks_projects` and
  // `tasks_hashtags`), and each fire used to invalidate the snapshot key
  // directly, so one action could pay for the 18-query snapshot more than
  // once. Every fire now just restarts one timer.
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSnapshotRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => {
      refetchTimerRef.current = null;
      void queryClient.invalidateQueries({ queryKey: snapshotKey });
    }, SNAPSHOT_REFETCH_DEBOUNCE_MS);
  }, [queryClient, snapshotKey]);

  useEffect(
    () => () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    },
    [],
  );

  // Keep the search index live: schedule a snapshot refetch whenever any table
  // it indexes changes. Each subscription shares the app's singleton Realtime
  // channel (refcount), so this adds no extra channels. Covers the core
  // entities plus the join/derived tables that feed indexed fields
  // (task→project links, capture tags, habit streaks).
  const subscription = useMemo(
    () => ({ onEvent: scheduleSnapshotRefetch }),
    [scheduleSnapshotRefetch],
  );
  useTableSubscription("tasks", userId, subscription);
  useTableSubscription("tasks_projects", userId, subscription);
  useTableSubscription("captures", userId, subscription);
  useTableSubscription("captures_hashtags", userId, subscription);
  useTableSubscription("hashtags", userId, subscription);
  useTableSubscription("pages", userId, subscription);
  useTableSubscription("pages_projects", userId, subscription);
  useTableSubscription("journal_entries", userId, subscription);
  useTableSubscription("projects", userId, subscription);
  useTableSubscription("areas", userId, subscription);
  useTableSubscription("habits", userId, subscription);
  useTableSubscription("habit_completions", userId, subscription);

  // `data` is undefined until the client query lands, which is legal now that
  // there is no server-provided initialData: an empty index searches to zero
  // results rather than throwing.
  const index = useMemo(() => (data ? buildSearchIndex(data) : []), [data]);

  return <SearchIndexContext.Provider value={index}>{children}</SearchIndexContext.Provider>;
}

function useSearchIndex(): SearchEntry[] {
  const ctx = useContext(SearchIndexContext);
  // Ref keeps the index identity stable for consumers that read it imperatively.
  const ref = useRef<SearchEntry[]>(ctx ?? []);
  ref.current = ctx ?? [];
  return ref.current;
}

const EMPTY_RESULTS: SearchResults = {
  tasks: [],
  captures: [],
  pages: [],
  journal: [],
  projects: [],
  areas: [],
  habits: [],
  total: 0,
};

const DEBOUNCE_MS = 150;

export interface UseSearch {
  query: string;
  setQuery: (q: string) => void;
  clear: () => void;
  results: SearchResults;
  /** Debounced, trimmed term that produced `results`; use for <mark>. */
  term: string;
  /** True once the user has typed a non-empty query (post-debounce). */
  active: boolean;
}

/**
 * Per-surface search state: holds its own query, debounces input at 150ms, and
 * runs the shared engine against the shared index. Each surface (full page,
 * Cmd+K dropdown) calls this independently.
 */
export function useSearch(): UseSearch {
  const index = useSearchIndex();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const results = useMemo(() => {
    const q = debounced.trim();
    if (!q) return EMPTY_RESULTS;
    return search(index, q);
  }, [index, debounced]);

  return {
    query,
    setQuery,
    clear: () => setQuery(""),
    results,
    term: debounced.trim(),
    active: debounced.trim().length > 0,
  };
}
