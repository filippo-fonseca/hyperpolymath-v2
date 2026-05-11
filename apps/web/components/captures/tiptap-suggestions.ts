import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import { HashtagSuggestionList } from "./HashtagSuggestionList";

/**
 * A suggestion item shown in the popover. Must remain assignable to
 * `MentionNodeAttrs` so the Mention extension's default command shape is satisfied.
 *
 * - `id`: the suggestion's stable identifier; we use the displayName here so the
 *   server-side upsertHashtag flow canonicalizes lowercase/displayName naturally
 *   (the TipTap mention node carries this in attrs.id at render time).
 * - `label`: the user-visible chip text (preserves first-seen casing for CAPT-08).
 * - `isNew`: optional UI flag — shown as " (new)" in the popover list only.
 */
export interface HashtagOption extends MentionNodeAttrs {
  // Inherits id: string | null and label?: string | null from MentionNodeAttrs.
  // At runtime our items() always sets both to non-null strings.
  isNew?: boolean;
}

interface HashtagSource {
  id: string;
  name: string;
  displayName: string;
}

/**
 * TipTap suggestion config for `#hashtag` autocomplete (D-10).
 *
 * - char "#" triggers the popup
 * - items(): filters provided hashtag source by lowercased query (matches `name`),
 *   sliced to 8, then appends a final "Create #<query> (new)" sentinel if there is
 *   no exact-match (CAPT-08 normalization happens server-side)
 * - render(): mounts a React popover (HashtagSuggestionList) at the cursor's
 *   clientRect. onKeyDown forwards arrow/enter/escape to the list via imperative ref
 * - command(): inserts the selected mention as a TipTap node. For "new" sentinels,
 *   uses the typed query as the label (so the server-side upsertHashtag canonicalizes)
 */
export function createHashtagSuggestion(
  getHashtags: () => HashtagSource[],
): Omit<SuggestionOptions<HashtagOption, HashtagOption>, "editor"> {
  return {
    char: "#",
    startOfLine: false,
    allowSpaces: false,

    items: ({ query }) => {
      const hashes = getHashtags();
      const lower = query.toLowerCase();
      const matches: HashtagOption[] = hashes
        .filter((h) => h.name.includes(lower))
        .slice(0, 8)
        // id = displayName so the mention node carries human-readable text;
        // server-side upsertHashtag lowercases for canonical CAPT-08 normalization.
        .map((h) => ({ id: h.displayName, label: h.displayName, isNew: false }));
      if (query.length > 0 && !hashes.some((h) => h.name === lower)) {
        matches.push({ id: query, label: query, isNew: true });
      }
      return matches;
    },

    command: ({ editor, range, props }) => {
      // Mention extension's default command wants { id, label }.
      // Use the label (preserves first-seen casing) as both id and label —
      // server-side upsertHashtag lowercases for canonical CAPT-08 storage.
      const label = props.label ?? (typeof props.id === "string" ? props.id : "");
      if (!label) return;
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "mention",
            attrs: { id: label, label },
          },
          { type: "text", text: " " },
        ])
        .run();
    },

    render: () => {
      let container: HTMLDivElement | null = null;
      let root: Root | null = null;
      let highlightedIndex = 0;
      let currentItems: HashtagOption[] = [];
      let currentCommand: ((opts: HashtagOption) => void) | null = null;

      function position(rect: DOMRect | null) {
        if (!container || !rect) return;
        container.style.position = "fixed";
        container.style.top = `${rect.bottom + 4}px`;
        container.style.left = `${rect.left}px`;
        container.style.zIndex = "9999";
      }

      function rerender() {
        if (!root) return;
        root.render(
          createElement(HashtagSuggestionList, {
            items: currentItems,
            highlightedIndex,
            onSelect: (i: number) => {
              const item = currentItems[i];
              if (item && currentCommand) currentCommand(item);
            },
          }),
        );
      }

      return {
        onStart: (props) => {
          if (!props.clientRect) return;
          container = document.createElement("div");
          document.body.appendChild(container);
          root = createRoot(container);
          highlightedIndex = 0;
          currentItems = props.items;
          currentCommand = props.command;
          position(props.clientRect());
          rerender();
        },

        onUpdate: (props) => {
          currentItems = props.items;
          currentCommand = props.command;
          highlightedIndex = Math.min(
            highlightedIndex,
            Math.max(0, currentItems.length - 1),
          );
          if (props.clientRect) position(props.clientRect());
          rerender();
        },

        onKeyDown: (props) => {
          if (props.event.key === "ArrowUp") {
            highlightedIndex =
              (highlightedIndex - 1 + currentItems.length) %
              Math.max(1, currentItems.length);
            rerender();
            return true;
          }
          if (props.event.key === "ArrowDown") {
            highlightedIndex =
              (highlightedIndex + 1) % Math.max(1, currentItems.length);
            rerender();
            return true;
          }
          if (props.event.key === "Enter") {
            const item = currentItems[highlightedIndex];
            if (item && currentCommand) {
              currentCommand(item);
              return true;
            }
            return false;
          }
          if (props.event.key === "Escape") {
            // Closing handled by suggestion plugin itself; signal we did not handle
            return false;
          }
          return false;
        },

        onExit: () => {
          if (root) {
            // Unmount asynchronously to avoid the React 19 "Attempted to synchronously
            // unmount a root while React was already rendering" warning that fires when
            // exit is triggered from inside a render lifecycle.
            const rootRef = root;
            const containerRef = container;
            queueMicrotask(() => {
              rootRef.unmount();
              if (containerRef && containerRef.parentNode) {
                containerRef.parentNode.removeChild(containerRef);
              }
            });
          }
          root = null;
          container = null;
        },
      };
    },
  };
}
