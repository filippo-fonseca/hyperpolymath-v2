"use client";

import { cn } from "@/lib/utils";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { PersonOption } from "./person-suggestions";

interface Props {
  items: PersonOption[];
  command: (item: PersonOption) => void;
}

/**
 * Imperative handle the TipTap suggestion plugin forwards arrow / Enter /
 * Escape keystrokes through. Same pattern + rationale as HashtagSuggestionList
 * (the popover lives outside the editor's React tree and never holds focus, so
 * ProseMirror pokes its selection state via ref on every keystroke).
 */
export interface PersonSuggestionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

/**
 * Floating `@person` suggestion list (Phase C). Mirrors HashtagSuggestionList:
 * owns its own selectedIndex, resets on item change, and renders each person
 * with an "@" prefix plus a "(new)" hint for the inline-create sentinel.
 */
export const PersonSuggestionList = forwardRef<PersonSuggestionListHandle, Props>(
  function PersonSuggestionList({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    function selectItem(index: number) {
      const item = items[index];
      if (item) command(item);
    }

    function upHandler() {
      if (items.length === 0) return;
      setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
    }

    function downHandler() {
      if (items.length === 0) return;
      setSelectedIndex((prev) => (prev + 1) % items.length);
    }

    function enterHandler() {
      setSelectedIndex((current) => {
        selectItem(current);
        return current;
      });
    }

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: ({ event }) => {
          if (event.key === "ArrowUp") {
            upHandler();
            return true;
          }
          if (event.key === "ArrowDown") {
            downHandler();
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            enterHandler();
            return true;
          }
          return false;
        },
      }),
      [items]
    );

    if (items.length === 0) return null;

    return (
      <div
        className="min-w-[200px] max-w-[280px] rounded-md border bg-popover text-popover-foreground shadow-md py-1 font-sans text-[13px]"
        role="listbox"
        data-mention-suggestion-active="person"
      >
        {items.map((item, i) => {
          const isHighlighted = i === selectedIndex;
          return (
            <button
              type="button"
              key={item.id ?? `idx-${i}`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectItem(i);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
              className={cn(
                "w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors",
                isHighlighted && "bg-[var(--sd-hover)] text-[var(--sd-ink)]",
                !isHighlighted && "text-[var(--sd-ink)] hover:bg-[var(--sd-hover)]"
              )}
              role="option"
              aria-selected={isHighlighted}
            >
              <span className="truncate">
                @{item.label}
                {item.isNew && <span className="ml-1 italic text-[var(--sd-ink-faint)]">(new)</span>}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
);
