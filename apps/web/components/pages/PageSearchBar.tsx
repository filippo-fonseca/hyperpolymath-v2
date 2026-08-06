"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef } from "react";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  /** Total matches for the current query. */
  total: number;
  /** 1-based index of the active match, 0 when none. */
  current: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

/**
 * Floating in-page find bar for the Wiki editor. Pinned below the per-doc nav
 * bar at the top-right so it never covers the matches it scrolls to. Enter steps
 * to the next match, Shift+Enter to the previous, Escape closes. The input
 * autofocuses on mount so the user can type immediately after opening.
 */
export function PageSearchBar({
  query,
  onQueryChange,
  total,
  current,
  onNext,
  onPrev,
  onClose,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus + select on open so an immediate re-open with the same query lets
  // the user overtype.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) onPrev();
      else onNext();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  const counter = query.trim() === "" ? "" : total === 0 ? "No results" : `${current}/${total}`;
  const hasMatches = total > 0;

  return (
    // aug-04 craft-ui-v2: the find bar floats as a frosted pop over the sheet.
    <div className="craft-glass-pop absolute top-12 right-6 z-20 flex items-center gap-1 px-1.5 py-1">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in page"
        spellCheck={false}
        className="w-40 bg-transparent px-1 text-meta font-mono text-[var(--ink)] outline-none placeholder:text-[var(--ink-muted)]"
      />

      <span className="min-w-[52px] text-right text-micro font-mono tabular-nums text-[var(--ink-muted)]">
        {counter}
      </span>

      <button
        type="button"
        onClick={onPrev}
        disabled={!hasMatches}
        title="Previous match (Shift+Enter)"
        className="rounded-sm p-1 text-[var(--ink-muted)] transition-colors duration-150 hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--ink-muted)]"
      >
        <ChevronUp size={13} strokeWidth={1.75} />
      </button>

      <button
        type="button"
        onClick={onNext}
        disabled={!hasMatches}
        title="Next match (Enter)"
        className="rounded-sm p-1 text-[var(--ink-muted)] transition-colors duration-150 hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--ink-muted)]"
      >
        <ChevronDown size={13} strokeWidth={1.75} />
      </button>

      <button
        type="button"
        onClick={onClose}
        title="Close (Esc)"
        className="rounded-sm p-1 text-[var(--ink-muted)] transition-colors duration-150 hover:bg-[var(--surface)] hover:text-[var(--ink)]"
      >
        <X size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}
