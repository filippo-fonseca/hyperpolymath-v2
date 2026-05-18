"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import type { ProjectOption } from "./project-suggestions";

/**
 * Mirror of HashtagSuggestionList.tsx (Phase 2 commit 25e5e57) — the canonical
 * TipTap suggestion-popover pattern: forwardRef + useImperativeHandle so the
 * suggestion plugin can forward ArrowUp/Down/Enter keystrokes into a component
 * that lives OUTSIDE the editor's React tree (mounted via createRoot at
 * document.body by project-suggestions.ts).
 *
 * Why imperative-ref:
 *   The popover never has focus while the editor does. ProseMirror calls
 *   renderer.onKeyDown synchronously from its native keydown handler, and that
 *   call must reach the component's current `selectedIndex` state. The
 *   suggestion plugin only re-renders the popover when items/query change —
 *   not on every arrow press — so state must live in the component and the
 *   plugin pokes it.
 */
interface Props {
  items: ProjectOption[];
  command: (item: ProjectOption) => void;
}

export interface ProjectSuggestionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const ProjectSuggestionList = forwardRef<
  ProjectSuggestionListHandle,
  Props
>(function ProjectSuggestionList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  function selectItem(index: number) {
    const item = items[index];
    if (item) command(item);
  }

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === "ArrowUp") {
          setSelectedIndex((p) => (p - 1 + items.length) % items.length);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((p) => (p + 1) % items.length);
          return true;
        }
        // Enter AND Tab both select — Tab is the canonical "accept
        // autocomplete" key (parity with hashtag + slash popovers).
        if (event.key === "Enter" || event.key === "Tab") {
          setSelectedIndex((current) => {
            selectItem(current);
            return current;
          });
          return true;
        }
        return false;
      },
    }),
    [items],
  );

  if (items.length === 0) return null;

  return (
    <div
      className="min-w-[200px] max-w-[280px] rounded-md border bg-popover text-popover-foreground shadow-md py-1 font-sans text-[13px]"
      role="listbox"
      data-mention-suggestion-active="project"
    >
      {items.map((item, i) => {
        const isHighlighted = i === selectedIndex;
        return (
          <button
            type="button"
            key={(typeof item.id === "string" && item.id) || `idx-${i}`}
            onMouseDown={(e) => {
              // onMouseDown fires before editor blur — keep caret in editor
              e.preventDefault();
              selectItem(i);
            }}
            onMouseEnter={() => setSelectedIndex(i)}
            className={cn(
              "w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors",
              isHighlighted && "bg-secondary text-foreground",
              !isHighlighted && "text-foreground hover:bg-secondary/60",
            )}
            role="option"
            aria-selected={isHighlighted}
          >
            {item.icon ? (
              <span className="text-base">{item.icon}</span>
            ) : null}
            <span className="truncate">${item.label ?? item.id}</span>
          </button>
        );
      })}
    </div>
  );
});
