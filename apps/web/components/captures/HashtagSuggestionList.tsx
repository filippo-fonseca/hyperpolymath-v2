"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import type { HashtagOption } from "./tiptap-suggestions";

interface Props {
  items: HashtagOption[];
  command: (item: HashtagOption) => void;
}

/**
 * Imperative handle exposed via `ref` for the TipTap suggestion plugin to
 * forward arrow / Enter / Escape keystrokes into this component. This is
 * the canonical TipTap mention-list pattern — see
 * https://tiptap.dev/docs/editor/api/extensions/mention#create-a-suggestion
 *
 * Why imperative-ref:
 * - The popover is mounted via `createRoot` at `document.body`, *outside*
 *   the editor's React tree. It never has focus while the editor does.
 * - ProseMirror calls `renderer.onKeyDown` synchronously from inside its
 *   native keydown handler. That call must reach the component's current
 *   state (`selectedIndex`). Passing the index as a prop won't work — the
 *   suggestion plugin only re-renders the popover when the editor's doc
 *   changes (items / query / clientRect), not on every arrow press.
 * - So: state lives in the React component, and the plugin pokes it via
 *   imperative handle on every keystroke.
 */
export interface HashtagSuggestionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

/**
 * Floating suggestion list rendered by the TipTap hashtag suggestion popover.
 * Lives outside the editor's React tree (mounted via createRoot at document.body
 * by tiptap-suggestions.ts).
 *
 * Owns `selectedIndex` state internally (resets whenever `items` changes).
 * Exposes an imperative `onKeyDown(event)` via forwardRef so the suggestion
 * plugin can forward ArrowUp/ArrowDown/Enter keystrokes from the editor's
 * keydown handler (the popover itself never has focus).
 */
export const HashtagSuggestionList = forwardRef<
  HashtagSuggestionListHandle,
  Props
>(function HashtagSuggestionList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection whenever the item list changes (typing narrows results).
  // Clamp to a valid index so an out-of-range selection can't survive a filter.
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
    // Use the state setter functional form so we always read the latest
    // selection (in case multiple keys arrive in the same tick).
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
        // Enter AND Tab both select — Tab is the canonical "accept
        // autocomplete" key (parity with slash + project popovers, and
        // most code editors / shell completions).
        if (event.key === "Enter" || event.key === "Tab") {
          enterHandler();
          return true;
        }
        // Space finalizes the highlighted hashtag too (#137). The user can
        // commit a tag with EITHER Space or Enter — Enter stays optional, no
        // confirmation keystroke required. We only intercept Space when there
        // is a real item to commit (length > 0, which is always true while the
        // popover is open since items() emits the "(new)" sentinel for any
        // non-empty query). The command() inserts the mention node followed by
        // a trailing space, so returning `true` here (which makes ProseMirror
        // call preventDefault) avoids a doubled space after the chip.
        if (event.key === " " && items.length > 0) {
          enterHandler();
          return true;
        }
        return false;
      },
    }),
    // Recreate the handle whenever items changes — the handlers close over
    // `items` (length, current value at index), so a stale closure would
    // operate on yesterday's list. `selectedIndex` is read via the state
    // updater functional form, so it doesn't need to be a dep.
    [items],
  );

  if (items.length === 0) return null;

  return (
    <div
      className="min-w-[200px] max-w-[280px] rounded-md border bg-popover text-popover-foreground shadow-md py-1 font-sans text-[13px]"
      role="listbox"
      data-mention-suggestion-active="hashtag"
    >
      {items.map((item, i) => {
        const isHighlighted = i === selectedIndex;
        return (
          <button
            type="button"
            key={item.id ?? `idx-${i}`}
            // onMouseDown (not onClick) — fires *before* the editor's blur
            // handler steals focus. preventDefault keeps caret in the editor
            // so the subsequent insertContent transaction has a valid range.
            onMouseDown={(e) => {
              e.preventDefault();
              selectItem(i);
            }}
            // Update highlight on hover so mouse + keyboard feel unified.
            onMouseEnter={() => setSelectedIndex(i)}
            className={cn(
              "w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors",
              isHighlighted && "bg-[var(--sd-hover)] text-[var(--sd-ink)]",
              !isHighlighted && "text-[var(--sd-ink)] hover:bg-[var(--sd-hover)]",
            )}
            role="option"
            aria-selected={isHighlighted}
          >
            <span className="truncate">
              #{item.label}
              {item.isNew && (
                <span className="ml-1 italic text-[var(--sd-ink-faint)]">
                  (new)
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
});
