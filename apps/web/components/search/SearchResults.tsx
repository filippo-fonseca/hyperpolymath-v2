"use client";

import {
  resultsForType,
  SEARCH_TYPE_LABEL,
  SEARCH_TYPE_ORDER,
  type SearchEntry,
  type SearchResults as Results,
  type SearchType,
} from "@/lib/search";
import { SearchResultItem } from "./SearchResultItem";

interface Props {
  results: Results;
  query: string;
  /** 'all' shows every group; a type narrows to that group only. */
  filter: SearchType | "all";
  focusedIndex: number;
  onSelect: (entry: SearchEntry) => void;
  registerItemRef: (index: number, el: HTMLButtonElement | null) => void;
  variant?: "full" | "compact";
  /**
   * Shifts the indices used for focus + ref registration. Lets a host place
   * other focusable rows (e.g. quick-create actions) ahead of the results under
   * one shared focusedIndex. Defaults to 0 (results start the list).
   */
  indexOffset?: number;
}

/** Flat, ordered list of visible entries (used by the parent for keyboard nav). */
export function flattenResults(results: Results, filter: SearchType | "all"): SearchEntry[] {
  const flat: SearchEntry[] = [];
  for (const type of SEARCH_TYPE_ORDER) {
    if (filter !== "all" && filter !== type) continue;
    flat.push(...resultsForType(results, type));
  }
  return flat;
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--edge)] px-1 pb-1.5">
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--ink-muted)]">
        {label}
      </span>
      {/* Count sits on its own quiet plate rather than floating as loose type. */}
      <span className="inline-flex min-w-5 items-center justify-center rounded-md bg-[var(--hover)] px-1.5 py-[1px] font-mono text-[10px] text-[var(--ink-muted)]">
        {count}
      </span>
    </div>
  );
}

export function SearchResults({
  results,
  query,
  filter,
  focusedIndex,
  onSelect,
  registerItemRef,
  variant = "full",
  indexOffset = 0,
}: Props) {
  // Start one below the offset so the first entry lands at exactly indexOffset.
  let runningIndex = indexOffset - 1;

  return (
    <div className={variant === "compact" ? "flex flex-col gap-3" : "flex flex-col gap-6"}>
      {SEARCH_TYPE_ORDER.map((type) => {
        if (filter !== "all" && filter !== type) return null;
        const entries = resultsForType(results, type);
        if (entries.length === 0) return null;

        return (
          <section key={type} className="flex flex-col gap-1">
            <SectionHeader label={SEARCH_TYPE_LABEL[type]} count={entries.length} />
            {/* Rows lift into cards on hover, so they need a hair of air
                between them or the shadows collide. */}
            <div className="mt-1.5 flex flex-col gap-1" role="listbox">
              {entries.map((entry) => {
                runningIndex += 1;
                const index = runningIndex;
                return (
                  <SearchResultItem
                    key={entry.id}
                    entry={entry}
                    query={query}
                    variant={variant}
                    focused={index === focusedIndex}
                    onSelect={onSelect}
                    itemRef={(el) => registerItemRef(index, el)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
