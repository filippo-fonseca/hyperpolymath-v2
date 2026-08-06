"use client";

import { Search, SearchX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resultsForType,
  SEARCH_TYPE_LABEL,
  SEARCH_TYPE_ORDER,
  type SearchEntry,
  type SearchType,
} from "@/lib/search";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSearch } from "./SearchProvider";
import { SearchInput } from "./SearchInput";
import { flattenResults, SearchResults } from "./SearchResults";

type Filter = SearchType | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  ...SEARCH_TYPE_ORDER.map((t) => ({ value: t, label: SEARCH_TYPE_LABEL[t] })),
];

export function SearchPageClient() {
  const router = useRouter();
  const { query, setQuery, clear, results, term, active } = useSearch();
  const [filter, setFilter] = useState<Filter>("all");
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef(new Map<number, HTMLButtonElement | null>());

  const flat = useMemo(() => flattenResults(results, filter), [results, filter]);

  // Reset focus whenever the visible set changes.
  useEffect(() => {
    setFocusedIndex(-1);
  }, [term, filter]);

  // Keep the focused item visible.
  useEffect(() => {
    if (focusedIndex < 0) return;
    itemRefs.current.get(focusedIndex)?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  const navigate = useCallback(
    (entry: SearchEntry) => {
      router.push(entry.href);
    },
    [router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, flat.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, -1));
      } else if (e.key === "Enter") {
        if (focusedIndex >= 0 && flat[focusedIndex]) {
          e.preventDefault();
          navigate(flat[focusedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        clear();
      }
    },
    [flat, focusedIndex, navigate, clear]
  );

  const registerItemRef = useCallback((index: number, el: HTMLButtonElement | null) => {
    itemRefs.current.set(index, el);
  }, []);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-6 py-8">
      {/* Sticky search bar + filters. */}
      <div className="sticky top-0 z-10 -mx-6 bg-[var(--canvas)] px-6 pb-4">
        <SearchInput
          ref={inputRef}
          value={query}
          onChange={setQuery}
          onClear={clear}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder="Search everything: tasks, captures, projects, areas…"
        />

        {/* Segmented filter rail: craft chips on the sheet. The active chip
            fills; the track it used to sit in is gone. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const isActive = filter === f.value;
            const count =
              f.value === "all" ? results.total : resultsForType(results, f.value).length;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => setFilter(f.value)}
                className="craft-chip cursor-pointer-always"
              >
                {f.label}
                {active && <span className="text-micro tabular-nums opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body. */}
      <div className="flex-1 pt-2">
        {!active ? (
          <SearchIdle />
        ) : results.total === 0 ? (
          <NoResults query={term} />
        ) : (
          <SearchResults
            results={results}
            query={term}
            filter={filter}
            focusedIndex={focusedIndex}
            onSelect={navigate}
            registerItemRef={registerItemRef}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Both empty states now route through the app's single EmptyState, which puts
 * the icon on a circular pastel plate. Search claims sky as its feature hue;
 * the no-results state shifts to peach so a fruitless query reads as a
 * different weather, not a broken page.
 */
function SearchIdle() {
  return (
    <EmptyState
      size="page"
      className="tint-sky"
      icon={<Search strokeWidth={1.5} />}
      title="Search everything"
      description="Tasks, captures, projects, areas, and habits, all in one place. Start typing above."
    />
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <EmptyState
      size="page"
      className="tint-peach"
      icon={<SearchX strokeWidth={1.5} />}
      title={`No results for “${query}”`}
      description="Try a different word, or check your filters."
    />
  );
}
