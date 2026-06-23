import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { type RefObject, createElement, createRef } from "react";
import { type Root, createRoot } from "react-dom/client";
import { PersonSuggestionList, type PersonSuggestionListHandle } from "./PersonSuggestionList";

/**
 * A `@person` suggestion item. Must stay assignable to `MentionNodeAttrs` so the
 * Mention extension's default command shape is satisfied.
 *
 * - `id`:    the person's display name. We deliberately carry the NAME (not the
 *            person id) so the create-on-save flow can resolve-or-create by name
 *            server side, exactly like hashtags canonicalize on save. The mention
 *            node therefore never holds a person id; names map to ids at save.
 * - `label`: the visible chip text (first-seen casing).
 * - `isNew`: UI-only flag rendered as " (new)" for the inline-create sentinel.
 */
export interface PersonOption extends MentionNodeAttrs {
  isNew?: boolean;
}

export interface PersonSource {
  id: string;
  name: string;
}

/**
 * TipTap suggestion config for `@person` autocomplete (Phase C). Twin of
 * createHashtagSuggestion: char "@", filters the provided people by lowercased
 * query, slices to 8, and appends a "Create '<query>' (new)" sentinel when no
 * exact match exists. The mention node stores the typed name; createCapture
 * resolves names to person ids and reconciles people_references on save.
 */
export function createPersonSuggestion(
  getPeople: () => PersonSource[]
): Omit<SuggestionOptions<PersonOption, PersonOption>, "editor"> {
  return {
    char: "@",
    startOfLine: false,
    allowSpaces: true,

    items: ({ query }) => {
      const people = getPeople();
      const lower = query.toLowerCase();
      const matches: PersonOption[] = people
        .filter((p) => p.name.toLowerCase().includes(lower))
        .slice(0, 8)
        .map((p) => ({ id: p.name, label: p.name, isNew: false }));
      const trimmed = query.trim();
      const exact = people.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
      if (trimmed.length > 0 && !exact) {
        matches.push({ id: trimmed, label: trimmed, isNew: true });
      }
      return matches;
    },

    command: ({ editor, range, props }) => {
      const label = props.label ?? (typeof props.id === "string" ? props.id : "");
      if (!label) return;
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: "personMention", attrs: { id: label, label } },
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

      function render(items: PersonOption[], command: (item: PersonOption) => void) {
        if (!root) return;
        root.render(createElement(PersonSuggestionList, { ref: listRef, items, command }));
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
