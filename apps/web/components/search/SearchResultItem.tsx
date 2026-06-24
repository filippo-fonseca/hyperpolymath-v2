"use client";

import { cn } from "@/lib/utils";
import type { SearchEntry } from "@/lib/search";
import { HighlightedText } from "./HighlightedText";
import { TypeBadge } from "./TypeBadge";

interface Props {
  entry: SearchEntry;
  query: string;
  variant?: "full" | "compact";
  focused?: boolean;
  onSelect: (entry: SearchEntry) => void;
  /** Forwarded so the parent can scroll a focused item into view. */
  itemRef?: (el: HTMLButtonElement | null) => void;
  id?: string;
}

function Breadcrumb({ parts, compact }: { parts: string[]; compact?: boolean }) {
  if (parts.length === 0) return null;
  return (
    <div
      className={cn("truncate text-[var(--ink-muted)]", compact ? "text-[11px]" : "text-[12px]")}
    >
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="px-1 opacity-50">/</span>}
          {p}
        </span>
      ))}
    </div>
  );
}

function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <>
      {tags.map((t) => (
        <span key={t} className="text-[var(--ink-muted)]">
          #{t}
        </span>
      ))}
    </>
  );
}

export function SearchResultItem({
  entry,
  query,
  variant = "full",
  focused = false,
  onSelect,
  itemRef,
  id,
}: Props) {
  const compact = variant === "compact";
  const isCapture = entry.type === "capture";
  // Captures lead with their preview; everything else leads with its title.
  const primary = isCapture ? (entry.preview ?? entry.title) : entry.title;

  return (
    <button
      ref={itemRef}
      id={id}
      type="button"
      role="option"
      aria-selected={focused}
      onClick={() => onSelect(entry)}
      className={cn(
        "group/result w-full rounded-lg text-left transition-colors duration-100",
        compact ? "px-2.5 py-1.5" : "px-3 py-2.5",
        focused ? "bg-[var(--surface)]" : "hover:bg-[color-mix(in_oklch,var(--ink)_4%,transparent)]"
      )}
    >
      {/* Meta row: badge + type-specific meta. */}
      <div className={cn("flex items-center gap-2", compact ? "text-[10px]" : "text-[11px]")}>
        <TypeBadge type={entry.type} compact={compact} />
        {isCapture ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 font-mono">
            <span className="flex items-center gap-1.5 truncate">
              {entry.tags && <TagChips tags={entry.tags} />}
            </span>
            {entry.meta && (
              <span className="ml-auto shrink-0 text-[var(--ink-muted)]">{entry.meta}</span>
            )}
          </div>
        ) : (
          entry.meta && <span className="font-mono text-[var(--ink-muted)]">{entry.meta}</span>
        )}
      </div>

      {/* Primary line. */}
      <div
        className={cn(
          "mt-1 truncate font-medium text-[var(--ink)]",
          compact ? "text-[13px]" : "text-[15px]"
        )}
      >
        <HighlightedText text={primary} query={query} />
      </div>

      {/* Secondary line: breadcrumb (tasks/projects). Captures already show
          tags+date in the meta row, so no breadcrumb there. */}
      {!isCapture && <Breadcrumb parts={entry.breadcrumb} compact={compact} />}
    </button>
  );
}
