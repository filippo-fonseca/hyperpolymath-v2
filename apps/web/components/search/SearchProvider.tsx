"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
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

interface ProviderProps {
  userId: string;
  initialSnapshot: SearchSnapshot;
  children: React.ReactNode;
}

/**
 * Holds the in-memory search index for the whole (app) subtree. The index is
 * rebuilt only when the snapshot reference changes (server initialData, then
 * refetch-on-focus), never on every render, satisfying the re-index contract.
 */
export function SearchProvider({ userId, initialSnapshot, children }: ProviderProps) {
  const { data } = useQuery({
    queryKey: ["search-snapshot", userId],
    queryFn: fetchSearchSnapshot,
    initialData: initialSnapshot,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Keep the search index live: refetch the snapshot whenever any table it
  // indexes changes. Each subscription shares the app's singleton Realtime
  // channel (refcount), so this adds no extra channels beyond the
  // search-snapshot key in their invalidation fanout. Covers the core
  // entities plus the join/derived tables that feed indexed fields
  // (task→project links, capture tags, habit streaks).
  const alsoInvalidate = useMemo(
    () => [["search-snapshot", userId]] as const,
    [userId],
  );
  useTableSubscription("tasks", userId, { alsoInvalidate });
  useTableSubscription("tasks_projects", userId, { alsoInvalidate });
  useTableSubscription("captures", userId, { alsoInvalidate });
  useTableSubscription("captures_hashtags", userId, { alsoInvalidate });
  useTableSubscription("hashtags", userId, { alsoInvalidate });
  useTableSubscription("projects", userId, { alsoInvalidate });
  useTableSubscription("areas", userId, { alsoInvalidate });
  useTableSubscription("habits", userId, { alsoInvalidate });
  useTableSubscription("habit_completions", userId, { alsoInvalidate });

  const index = useMemo(() => buildSearchIndex(data), [data]);

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
