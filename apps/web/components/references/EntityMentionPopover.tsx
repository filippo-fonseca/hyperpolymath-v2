"use client";

import { forwardRef } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import type { EntityMentionOption } from "@/lib/references/mention-list";
import { EntityMentionList, type EntityMentionListHandle } from "./EntityMentionList";

/**
 * Positions the @-mention menu at the caret — via Radix, not by hand.
 *
 * The four shipped suggestion popovers each hand-roll the same thing:
 *
 *     container.style.position = "fixed";
 *     container.style.top = `${rect.bottom + 4}px`;
 *     container.style.left = `${rect.left}px`;
 *
 * which has no collision handling whatsoever, so the menu is simply clipped by
 * the viewport when the caret is near the bottom of the screen. That is not an
 * edge case: it is where a chat composer lives. The JARVIS input sits pinned to
 * the bottom of the console, which means the shipped `@` menu there is broken
 * in the most common position it can possibly be in.
 *
 * A zero-size PopoverAnchor pinned to the caret rect buys Radix's whole
 * positioning stack for free — portal, collision detection, flip to `side=top`
 * when there's no room below, shift along the cross axis. `ui/popover.tsx`
 * already exported PopoverAnchor and nothing had used it.
 *
 * The one thing Radix does that must be switched OFF: PopoverContent grabs
 * focus on open. The entire keyboard contract depends on the editor keeping
 * focus while the menu is merely displayed, so both auto-focus events are
 * prevented. Pointer events outside stay live for the same reason (the menu is
 * not a modal; it must never eat a click meant for the page).
 */

interface Props {
  /** Caret rect from the suggestion plugin's `clientRect()`, in viewport px. */
  rect: { left: number; top: number; bottom: number } | null;
  open: boolean;
  items: EntityMentionOption[];
  command: (item: EntityMentionOption) => void;
  loading?: boolean;
  onEscape?: () => void;
}

export const EntityMentionPopover = forwardRef<EntityMentionListHandle, Props>(
  function EntityMentionPopover(
    { rect, open, items, command, loading, onEscape },
    ref,
  ) {
    return (
      <Popover open={open && rect !== null}>
        {/*
         * Zero-size and pointer-events-none: this element exists only to give
         * Radix a rect to measure. It must never be hit-testable, or it would
         * sit invisibly over the text at the caret.
         */}
        <PopoverAnchor asChild>
          <span
            aria-hidden
            style={{
              position: "fixed",
              left: rect?.left ?? 0,
              top: rect?.top ?? 0,
              // The anchor spans the caret's full height so `side="bottom"`
              // clears the text line instead of overlapping it.
              height: rect ? Math.max(rect.bottom - rect.top, 1) : 1,
              width: 0,
              pointerEvents: "none",
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          side="bottom"
          align="start"
          sideOffset={4}
          // Radix would focus the content on open; the editor must keep focus
          // or every arrow key goes to the wrong place.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // Not a modal: the page underneath stays interactive.
          onInteractOutside={(e) => e.preventDefault()}
          // Overrides ui/popover's w-72 + p-4 default plate padding — this
          // content is a list, and it sizes itself.
          className="w-auto p-0"
        >
          <EntityMentionList
            ref={ref}
            items={items}
            command={command}
            loading={loading}
            onEscape={onEscape}
          />
        </PopoverContent>
      </Popover>
    );
  },
);
