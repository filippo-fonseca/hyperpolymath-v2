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

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const isActive = filter === f.value;
            const count =
              f.value === "all" ? results.total : resultsForType(results, f.value).length;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-100",
                  isActive
                    ? "text-[var(--hud-cyan)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                )}
                style={
                  isActive
                    ? {
                        background: "color-mix(in oklch, var(--hud-cyan) 14%, transparent)",
                        boxShadow:
                          "inset 0 0 0 1px color-mix(in oklch, var(--hud-cyan) 26%, transparent)",
                      }
                    : {
                        background: "color-mix(in oklch, var(--ink) 5%, transparent)",
                      }
                }
              >
                {f.label}
                {active && <span className="ml-1.5 opacity-70">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body. */}
      <div className="flex-1 pt-2">
        {!active ? (
          <EmptyState />
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 pt-24 text-center">
      <Search size={48} strokeWidth={1.25} className="text-[var(--ink-muted)] opacity-40" />
      <h2 className="font-serif text-2xl font-semibold text-[var(--ink)]">Search everything</h2>
      <p className="max-w-sm font-serif text-[15px] text-[var(--ink-muted)]">
        Tasks, captures, projects, areas, and habits, all in one place. Start typing above.
      </p>
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 pt-24 text-center">
      <SearchX size={48} strokeWidth={1.25} className="text-[var(--ink-muted)] opacity-40" />
      <h2 className="font-serif text-xl font-semibold text-[var(--ink)]">
        No results for “{query}”
      </h2>
      <p className="max-w-sm font-serif text-[15px] text-[var(--ink-muted)]">
        Try a different word, or check your filters.
      </p>
    </div>
  );
}
