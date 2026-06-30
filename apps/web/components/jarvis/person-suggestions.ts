import { createRoot, type Root } from "react-dom/client";
import { createElement, createRef, type RefObject } from "react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import {
  PersonSuggestionList,
  type PersonSuggestionListHandle,
} from "@/components/captures/PersonSuggestionList";

/**
 * TipTap suggestion config for `@person` autocomplete in the JARVIS Console.
 *
 * Mirrors `createProjectSuggestion` (the `$project` config) with three
 * differences:
 *   1. `char: "@"` instead of `"$"`.
 *   2. Inserts node type `"personMention"` so the node coexists with the
 *      default `"mention"` (hashtag) and `"projectMention"` nodes in the same
 *      editor.
 *   3. The node carries the canonical person id in `attrs.id` (so the payload
 *      walker can extract `{ personId, name }`), unlike the captures composer's
 *      `@person` node which stores the typed name for resolve-or-create on save.
 *
 * Mention-existing-people-only: the JARVIS payload is a lightweight context
 * hint with no save-time DB write, so there is no inline "create person"
 * sentinel here (the captures composer owns that flow). The popover lists
 * people the user already has.
 */

export interface JarvisPersonOption extends MentionNodeAttrs {
  // id = canonical person UUID; label = display name.
}

export interface PersonSource {
  id: string;
  name: string;
}

export function createPersonSuggestion(
  getPeople: (query: string) => Promise<PersonSource[]> | PersonSource[]
): Omit<SuggestionOptions<JarvisPersonOption, JarvisPersonOption>, "editor"> {
  return {
    char: "@",
    startOfLine: false,
    allowSpaces: true,

    items: async ({ query }) => {
      const people = await getPeople(query);
      return people.slice(0, 8).map((p) => ({ id: p.id, label: p.name }));
    },

    command: ({ editor, range, props }) => {
      const personId = typeof props.id === "string" ? props.id : "";
      const personName = typeof props.label === "string" ? props.label : "";
      if (!personId) return;
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "personMention",
            attrs: { id: personId, label: personName },
          },
          { type: "text", text: " " },
        ])
        .run();
    },

    render: () => {
      let container: HTMLDivElement | null = null;
      let root: Root | null = null;
      const listRef: RefObject<PersonSuggestionListHandle | null> =
        createRef<PersonSuggestionListHandle>();

      function position(rect: DOMRect | null) {
        if (!container || !rect) return;
        container.style.position = "fixed";
        container.style.top = `${rect.bottom + 4}px`;
        container.style.left = `${rect.left}px`;
        container.style.zIndex = "9999";
      }

      function render(items: JarvisPersonOption[], command: (item: JarvisPersonOption) => void) {
        if (!root) return;
        root.render(
          createElement(PersonSuggestionList, {
            ref: listRef,
            items,
            command,
          })
        );
      }

      return {
        onStart: (props) => {
          if (!props.clientRect) return;
          container = document.createElement("div");
          document.body.appendChild(container);
          root = createRoot(container);
          position(props.clientRect());
          render(props.items, props.command);
        },

        onUpdate: (props) => {
          if (props.clientRect) position(props.clientRect());
          render(props.items, props.command);
        },

        onKeyDown: (props) => {
          if (!listRef.current) return false;
          return listRef.current.onKeyDown({ event: props.event });
        },

        onExit: () => {
          if (root) {
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
