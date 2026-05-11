"use client";

import { cn } from "@/lib/utils";
import type { HashtagOption } from "./tiptap-suggestions";

interface Props {
  items: HashtagOption[];
  highlightedIndex: number;
  onSelect: (index: number) => void;
}

/**
 * Floating suggestion list rendered by the TipTap hashtag suggestion popover.
 * Lives outside the editor's React tree (mounted via createRoot at document.body
 * by tiptap-suggestions.ts). Keep styling self-contained and minimal.
 */
export function HashtagSuggestionList({
  items,
  highlightedIndex,
  onSelect,
}: Props) {
  if (items.length === 0) return null;

  return (
    <div
      className="min-w-[200px] max-w-[280px] rounded-md border bg-popover text-popover-foreground shadow-md py-1 font-sans text-[13px]"
      role="listbox"
    >
      {items.map((item, i) => {
        const isHighlighted = i === highlightedIndex;
        return (
          <button
            type="button"
            key={item.id ?? `idx-${i}`}
            // Use onMouseDown so the click fires before TipTap's blur handler exits
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(i);
            }}
            className={cn(
              "w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors",
              isHighlighted && "bg-secondary text-foreground",
              !isHighlighted && "text-foreground hover:bg-secondary/60",
            )}
            role="option"
            aria-selected={isHighlighted}
          >
            <span className="truncate">
              #{item.label}
              {item.isNew && (
                <span className="ml-1 italic text-muted-foreground">
                  (new)
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
