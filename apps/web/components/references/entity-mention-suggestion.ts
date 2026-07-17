import type { SuggestionOptions } from "@tiptap/suggestion";
import { createElement, createRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { searchEntityMentions } from "@/app/actions/wiki-references";
import {
  type EntityMentionOption,
  flattenMentionGroups,
  isCreatePersonOption,
  optionToRef,
} from "@/lib/references/mention-list";
import { createMentionSearchRunner } from "@/lib/references/mention-search-runner";
import { refToEntityMentionNode } from "@/lib/references/tiptap-tokens";
import type { EntityMentionListHandle } from "./EntityMentionList";
import { EntityMentionPopover } from "./EntityMentionPopover";

/**
 * The universal `@` suggestion — one config, every TipTap surface.
 *
 * Replaces the person-only `@` wherever it exists. `#` and `$` are untouched:
 * they keep their own suggestion configs and their own node types, and this one
 * coexists alongside them in the same editor.
 *
 * Three differences from the four popovers it supersedes, all deliberate:
 *
 *   1. Results come from the server per keystroke (searchEntityMentions),
 *      debounced and stale-guarded by the runner, instead of filtering a
 *      pre-fetched in-memory list. Six entity kinds cannot be pre-fetched.
 *   2. It renders through Radix rather than a `position: fixed` div, so the
 *      menu flips instead of clipping at the viewport bottom.
 *   3. It is stateful across the popover's life (query in flight, results,
 *      dismissed), so the React root is re-rendered from a small local store
 *      rather than only when the plugin calls onUpdate.
 */

export interface EntityMentionSuggestionOptions {
  /**
   * Whether to offer the "Create person" sentinel.
   *
   * True on surfaces whose save path resolves-or-creates people by name (the
   * captures composer, capture detail, task notes — the Phase C flow). False in
   * JARVIS, which is mention-existing-only: its payload is a context hint with
   * no save-time DB write, so there is nothing to create against.
   */
  allowCreatePerson?: boolean;
  /**
   * Called when the sentinel is picked. The surface inserts its own legacy
   * name-carrying `personMention` node, because there is no id to point at
   * until the server resolves the name on save.
   */
  onCreatePerson?: (args: {
    name: string;
    editor: unknown;
    range: unknown;
  }) => void;
}

export function createEntityMentionSuggestion(
  options: EntityMentionSuggestionOptions = {},
): Omit<SuggestionOptions<EntityMentionOption, EntityMentionOption>, "editor"> {
  const { allowCreatePerson = false, onCreatePerson } = options;

  return {
    char: "@",
    startOfLine: false,
    // Matches the person-only `@` it replaces: people have spaces in their
    // names, and so do task titles and page titles.
    allowSpaces: true,

    /**
     * The plugin's own items() is unused — it would re-query on every
     * keystroke with no debounce and no stale guard. The render host owns
     * fetching; this just hands the query through so onStart/onUpdate see it.
     */
    items: () => [],

    command: ({ editor, range, props }) => {
      // The sentinel has no entity yet: hand it back to the surface, which
      // knows which legacy person node its save path expects.
      if (isCreatePersonOption(props)) {
        onCreatePerson?.({ name: props.label, editor, range });
        return;
      }
      const ref = optionToRef(props);
      if (!ref) return;
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          refToEntityMentionNode(ref),
          { type: "text", text: " " },
        ])
        .run();
    },

    render: () => {
      let container: HTMLDivElement | null = null;
      let root: Root | null = null;
      let rect: { left: number; top: number; bottom: number } | null = null;
      let items: EntityMentionOption[] = [];
      let loading = false;
      let dismissed = false;
      let command: (item: EntityMentionOption) => void = () => {};

      const listRef: RefObject<EntityMentionListHandle | null> =
        createRef<EntityMentionListHandle>();

      const runner = createMentionSearchRunner(
        (query: string) => searchEntityMentions(query),
        (state) => {
          loading = state.loading;
          items = state.results
            ? flattenMentionGroups(state.results.groups, {
                createPersonName: allowCreatePerson ? state.query : undefined,
              })
            : [];
          paint();
        },
      );

      function toRect(clientRect: DOMRect | null | undefined) {
        if (!clientRect) return null;
        return {
          left: clientRect.left,
          top: clientRect.top,
          bottom: clientRect.bottom,
        };
      }

      function paint() {
        if (!root) return;
        root.render(
          createElement(EntityMentionPopover, {
            ref: listRef,
            rect,
            open: !dismissed,
            items,
            command,
            loading,
            onEscape: () => {
              dismissed = true;
              paint();
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
          rect = toRect(props.clientRect());
          command = props.command;
          dismissed = false;
          runner.run(props.query);
          paint();
        },

        onUpdate: (props) => {
          if (props.clientRect) rect = toRect(props.clientRect());
          command = props.command;
          // A new query re-arms a menu the user escaped out of: they've since
          // typed something, which means they want it back.
          dismissed = false;
          runner.run(props.query);
          paint();
        },

        onKeyDown: (props) => {
          if (!listRef.current) return false;
          return listRef.current.onKeyDown({ event: props.event });
        },

        onExit: () => {
          runner.dispose();
          if (root) {
            const rootRef = root;
            const containerRef = container;
            // Unmounting synchronously inside ProseMirror's own event handler
            // trips React 19's sync-unmount warning — the same dodge the four
            // shipped popovers use.
            queueMicrotask(() => {
              rootRef.unmount();
              if (containerRef?.parentNode) {
                containerRef.parentNode.removeChild(containerRef);
              }
            });
          }
          root = null;
          container = null;
          rect = null;
          items = [];
        },
      };
    },
  };
}
