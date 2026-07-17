"use client";

import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import {
  MENTION_KIND_GLYPH,
  MENTION_KIND_LABEL,
  SEMANTIC_SECTION_LABEL,
  type EntityMentionOption,
  isCreatePersonOption,
  mentionRows,
} from "@/lib/references/mention-list";
import { cn } from "@/lib/utils";

/**
 * The universal @-mention menu: one grouped list, shared by every surface.
 *
 * The keyboard contract is NOT reinvented here. It is the one shipped by
 * HashtagSuggestionList → ProjectSuggestionList → PersonSuggestionList, kept
 * verbatim, and it is worth restating why each part is the way it is:
 *
 *   - forwardRef + useImperativeHandle, not props. The popover NEVER holds
 *     focus — the editor does. ProseMirror calls `onKeyDown` synchronously from
 *     its own native keydown handler, and that call has to reach this
 *     component's CURRENT selectedIndex. The suggestion plugin only re-renders
 *     the popover when items/query change, not on every arrow press, so the
 *     state lives here and the plugin pokes it through the ref.
 *   - `true` means handled. Returning false hands the key back to the editor.
 *   - Enter AND Tab both accept. Tab is the canonical accept-autocomplete key.
 *   - Selection wraps `mod items.length` over the FLAT list. Group headers are
 *     re-derived at render time by `mentionRows` from that same array, so a
 *     header can never be selected and the visual order is the keyboard's
 *     order by construction — no skip-the-header arithmetic to get wrong.
 *   - selectedIndex resets whenever items change, or the highlight strands
 *     itself past the end of a shorter result set.
 *   - Picks fire on onMouseDown + preventDefault(), not onClick: mousedown
 *     lands BEFORE the editor blurs, so the caret stays put and the insertion
 *     range is still valid.
 *
 * Escape is the one addition. The sibling lists return false and let the key
 * fall through; here it closes the menu (S5) and leaves the editor alone.
 */

interface Props {
  /** The flat option list — already grouped-ordered by flattenMentionGroups. */
  items: EntityMentionOption[];
  command: (item: EntityMentionOption) => void;
  /** True while the debounced query is in flight. */
  loading?: boolean;
  /** Closes the menu without touching the document. */
  onEscape?: () => void;
}

export interface EntityMentionListHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const EntityMentionList = forwardRef<EntityMentionListHandle, Props>(
  function EntityMentionList({ items, command, loading = false, onEscape }, ref) {
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
          // Escape closes even with nothing to show — a menu stuck open over an
          // empty result is still in the user's way.
          if (event.key === "Escape") {
            onEscape?.();
            return true;
          }
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
          // autocomplete" key (parity with hashtag + project + slash popovers).
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
      [items, onEscape],
    );

    const rows = mentionRows(items);

    return (
      <div
        className="max-h-[280px] min-w-[260px] max-w-[340px] overflow-y-auto py-1 font-sans text-[13px]"
        role="listbox"
        data-mention-suggestion-active="entity"
      >
        {items.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-[var(--sd-ink-faint)]">
            {loading ? "Searching…" : "No matches"}
          </div>
        ) : (
          rows.map((row) =>
            row.type === "header" ? (
              <div
                key={row.semantic ? "h-__semantic__" : `h-${row.kind}`}
                // Sticky so the section stays legible while a long group scrolls.
                className="sticky top-0 z-10 bg-[var(--sd-box)] px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]"
              >
                {row.semantic ? SEMANTIC_SECTION_LABEL : MENTION_KIND_LABEL[row.kind]}
              </div>
            ) : (
              <EntityMentionItem
                key={`${row.option.kind}-${row.option.id}-${row.index}`}
                option={row.option}
                isHighlighted={row.index === selectedIndex}
                onHover={() => setSelectedIndex(row.index)}
                onPick={() => selectItem(row.index)}
              />
            ),
          )
        )}
      </div>
    );
  },
);

function EntityMentionItem({
  option,
  isHighlighted,
  onHover,
  onPick,
}: {
  option: EntityMentionOption;
  isHighlighted: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const isCreate = isCreatePersonOption(option);
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Fires before the editor blurs — keeps the caret (and the insertion
        // range) alive. onClick would land after the blur.
        e.preventDefault();
        onPick();
      }}
      onMouseEnter={onHover}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
        isHighlighted
          ? "bg-[var(--sd-hover)] text-[var(--sd-ink)]"
          : "text-[var(--sd-ink)] hover:bg-[var(--sd-hover)]",
      )}
      role="option"
      aria-selected={isHighlighted}
    >
      <span className="w-[1.1em] shrink-0 text-center text-[var(--sd-ink-dull)]">
        {option.emoji || MENTION_KIND_GLYPH[option.kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {isCreate ? `Create person “${option.label}”` : option.label}
        </span>
        {option.sublabel && !isCreate ? (
          <span className="block truncate text-[11px] text-[var(--sd-ink-faint)]">
            {option.sublabel}
          </span>
        ) : null}
      </span>
      {isCreate ? (
        <span className="shrink-0 italic text-[11px] text-[var(--sd-ink-faint)]">
          new
        </span>
      ) : null}
    </button>
  );
}
