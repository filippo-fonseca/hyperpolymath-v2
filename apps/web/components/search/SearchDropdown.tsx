"use client";

import { CornerDownLeft } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  resultsForType,
  SEARCH_TYPE_ORDER,
  type SearchEntry,
  type SearchResults as Results,
} from "@/lib/search";
import { SearchResults } from "./SearchResults";

const MAX_PER_TYPE = 3;
const MAX_TYPES = 4;

/**
 * Cap raw results for the compact dropdown: max 3 per type, max 4 types
 * visible (≈12 items). Order follows SEARCH_TYPE_ORDER.
 */
export function capResults(results: Results): Results {
  const capped: Results = {
    tasks: [],
    captures: [],
    pages: [],
    journal: [],
    projects: [],
    areas: [],
    habits: [],
    total: 0,
  };
  let typesShown = 0;
  for (const type of SEARCH_TYPE_ORDER) {
    const entries = resultsForType(results, type);
    if (entries.length === 0) continue;
    if (typesShown >= MAX_TYPES) break;
    const slice = entries.slice(0, MAX_PER_TYPE);
    switch (type) {
      case "task":
        capped.tasks = slice;
        break;
      case "capture":
        capped.captures = slice;
        break;
      case "page":
        capped.pages = slice;
        break;
      case "journal":
        capped.journal = slice;
        break;
      case "project":
        capped.projects = slice;
        break;
      case "area":
        capped.areas = slice;
        break;
      case "habit":
        capped.habits = slice;
        break;
    }
    capped.total += slice.length;
    typesShown += 1;
  }
  return capped;
}

interface Props {
  results: Results;
  query: string;
  focusedIndex: number;
  onSelect: (entry: SearchEntry) => void;
  registerItemRef: (index: number, el: HTMLButtonElement | null) => void;
}

/**
 * Compact, non-blocking search dropdown anchored below the Cmd+K composer.
 * Absolutely positioned so it never shifts the input (opacity-only fade-in).
 */
export function SearchDropdown({ results, query, focusedIndex, onSelect, registerItemRef }: Props) {
  const reduceMotion = useReducedMotion();
  if (results.total === 0) return null;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border-[0.5px] border-[var(--edge)] bg-[var(--surface-raised)] shadow-lg"
    >
      <div className="max-h-[340px] overflow-y-auto p-2">
        <SearchResults
          results={results}
          query={query}
          filter="all"
          focusedIndex={focusedIndex}
          onSelect={onSelect}
          registerItemRef={registerItemRef}
          variant="compact"
        />
      </div>
      <div className="flex items-center gap-1.5 border-t border-[var(--edge)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
        <CornerDownLeft size={12} strokeWidth={1.5} />
        <span>Enter to open · ⌘⏎ to send to JARVIS</span>
      </div>
    </motion.div>
  );
}
