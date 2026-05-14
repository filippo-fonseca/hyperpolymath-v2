import { createRoot, type Root } from "react-dom/client";
import { createElement, createRef, type RefObject } from "react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import {
  ProjectSuggestionList,
  type ProjectSuggestionListHandle,
} from "./ProjectSuggestionList";

/**
 * TipTap suggestion config for `$project` autocomplete (D-02).
 *
 * Mirrors `apps/web/components/captures/tiptap-suggestions.ts` (Phase 2)
 * with two critical differences:
 *   1. `char: "$"` instead of `"#"`.
 *   2. Inserts node type `"projectMention"` (the JarvisInput extends the
 *      Mention extension with `name: "projectMention"` so this node coexists
 *      with the default `"mention"` hashtag node in the same editor).
 *
 * Server-side: ID lives in `attrs.id` (canonical project UUID); the editor
 * JSON walker in JarvisInput extracts it for the request payload.
 */

export interface ProjectOption extends MentionNodeAttrs {
  icon?: string | null;
}

interface ProjectSource {
  id: string; // canonical project UUID
  name: string; // user-facing name (case preserved)
  icon?: string | null;
}

export function createProjectSuggestion(
  getProjects: () => ProjectSource[],
): Omit<SuggestionOptions<ProjectOption, ProjectOption>, "editor"> {
  return {
    char: "$",
    startOfLine: false,
    allowSpaces: false,

    items: ({ query }) => {
      const projects = getProjects();
      const lower = query.toLowerCase();
      return projects
        .filter((p) => p.name.toLowerCase().includes(lower))
        .slice(0, 8)
        .map((p) => ({
          id: p.id,
          label: p.name,
          icon: p.icon ?? null,
        }));
    },

    command: ({ editor, range, props }) => {
      const projectId = typeof props.id === "string" ? props.id : "";
      const projectName = typeof props.label === "string" ? props.label : "";
      if (!projectId) return;
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "projectMention",
            attrs: { id: projectId, label: projectName },
          },
          { type: "text", text: " " },
        ])
        .run();
    },

    render: () => {
      let container: HTMLDivElement | null = null;
      let root: Root | null = null;
      const listRef: RefObject<ProjectSuggestionListHandle | null> =
        createRef<ProjectSuggestionListHandle>();

      function position(rect: DOMRect | null) {
        if (!container || !rect) return;
        container.style.position = "fixed";
        container.style.top = `${rect.bottom + 4}px`;
        container.style.left = `${rect.left}px`;
        container.style.zIndex = "9999";
      }

      function render(
        items: ProjectOption[],
        command: (item: ProjectOption) => void,
      ) {
        if (!root) return;
        root.render(
          createElement(ProjectSuggestionList, {
            ref: listRef,
            items,
            command,
          }),
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
            // Async unmount avoids React 19 sync-unmount-during-render warning
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
