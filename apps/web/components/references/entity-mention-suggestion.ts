import type { Editor, Range } from "@tiptap/core";
import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { createElement, createRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { searchEntityMentions } from "@/app/actions/wiki-references";
import {
  getReferencesSemanticEnabled,
  searchEntityMentionsSemantic,
} from "@/app/actions/references-semantic";
import {
  type EntityMentionOption,
  flattenMentionGroups,
  isCreatePersonOption,
  mergeSemanticOptions,
  optionToRef,
} from "@/lib/references/mention-list";
import type {
  EntityMentionCandidate,
  SemanticMentionResults,
} from "@/lib/references/mention-search";
import {
  SEMANTIC_MIN_QUERY_LENGTH,
  SEMANTIC_SEARCH_DEBOUNCE_MS,
} from "@/lib/references/semantic-search";
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
   * until the server resolves the name on save. `insertCreatedPerson` is the
   * default implementation every captures-shaped surface wants.
   */
  onCreatePerson?: (args: {
    name: string;
    editor: Editor;
    range: Range;
  }) => void;
}

/**
 * Insert the create-person sentinel's result: a name-carrying `personMention`,
 * identical to what the person-only `@` inserted before this menu replaced it.
 *
 * Deliberately NOT an entityMention. The person does not exist yet, so there is
 * no uuid, so there is no valid S1 token to write — and inventing one would put
 * a dangling id in the user's text. The name round-trips through the save
 * path's existing resolve-or-create instead, which is the flow that has shipped
 * since Phase C.
 */
export function insertCreatedPerson(
  editor: Editor,
  range: Range,
  name: string,
): void {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      { type: "personMention", attrs: { id: name, label: name } },
      { type: "text", text: " " },
    ])
    .run();
}

/**
 * The Mention extension hard-codes its suggestion's selected-item type to
 * `MentionNodeAttrs` ({id, label}), so a richer option type can't be threaded
 * through it generically — the callback parameter is contravariant and TS
 * rightly rejects it. The item flowing through the plugin IS an
 * EntityMentionOption at runtime (this module both produces and consumes it;
 * the plugin only passes it along untouched), so the two casts below are the
 * single, contained seam where that is asserted, rather than a cast at all five
 * mount sites.
 */
type MentionSuggestion = Omit<
  SuggestionOptions<EntityMentionOption, MentionNodeAttrs>,
  "editor"
>;

/**
 * The semantic-rung flag, probed ONCE per page load and cached (U7).
 *
 * The directive wants a read-once-per-mount probe, not a per-keystroke one;
 * caching it module-wide is stronger — every mention surface on the page shares
 * the single answer. A failed probe caches `false`, so a flaky call degrades to
 * the exact-only path rather than retrying on every keystroke. When the flag is
 * off (the default) the semantic runner never fires and the write paths and
 * exact search are untouched.
 */
let semanticEnabledCache: boolean | null = null;
let semanticProbe: Promise<boolean> | null = null;
function ensureSemanticFlag(): Promise<boolean> {
  if (semanticEnabledCache !== null) return Promise.resolve(semanticEnabledCache);
  if (!semanticProbe) {
    semanticProbe = getReferencesSemanticEnabled()
      .then((enabled) => {
        semanticEnabledCache = enabled;
        return enabled;
      })
      .catch(() => {
        semanticEnabledCache = false;
        return false;
      });
  }
  return semanticProbe;
}

export function createEntityMentionSuggestion(
  options: EntityMentionSuggestionOptions = {},
): MentionSuggestion {
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
      const option = props as unknown as EntityMentionOption;
      // The sentinel has no entity yet: hand it back to the surface, which
      // knows which legacy person node its save path expects.
      if (isCreatePersonOption(option)) {
        onCreatePerson?.({ name: option.label, editor, range });
        return;
      }
      const ref = optionToRef(option);
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
      let exactItems: EntityMentionOption[] = [];
      // The semantic "Related" hits for the CURRENT query, appended after the
      // exact groups. Cleared the instant a new query starts (see runSearches)
      // so a stale section can never sit under a different set of exact results.
      let semanticCandidates: EntityMentionCandidate[] = [];
      let currentQuery = "";
      let loading = false;
      let dismissed = false;
      let command: (item: EntityMentionOption) => void = () => {};

      const listRef: RefObject<EntityMentionListHandle | null> =
        createRef<EntityMentionListHandle>();

      // Exact search — unchanged: renders immediately on every keystroke, never
      // gated on the semantic promise. Loading + items come from here.
      const exactRunner = createMentionSearchRunner(
        (query: string) => searchEntityMentions(query),
        (state) => {
          loading = state.loading;
          exactItems = state.results
            ? flattenMentionGroups(state.results.groups, {
                createPersonName: allowCreatePerson ? state.query : undefined,
              })
            : [];
          paint();
        },
      );

      // Semantic search — the SECOND call (300ms debounce). Its own stale-guard
      // runner already drops out-of-order responses; the extra query check keeps
      // a settled result from landing after the user moved on. Loading ticks
      // (results null) are ignored so the section doesn't flicker.
      const semanticRunner = createMentionSearchRunner<SemanticMentionResults>(
        (query: string) => searchEntityMentionsSemantic(query),
        (state) => {
          if (state.results && state.results.query === currentQuery) {
            semanticCandidates = state.results.candidates;
            paint();
          }
        },
        SEMANTIC_SEARCH_DEBOUNCE_MS,
      );

      // Fire both searches for a query. The exact path always runs; the semantic
      // path runs only when the deployment flag is on AND the query is long
      // enough. A new query wipes the previous semantic section up front.
      function runSearches(query: string) {
        currentQuery = query;
        semanticCandidates = [];
        exactRunner.run(query);
        void ensureSemanticFlag().then((enabled) => {
          if (!enabled) return;
          // Superseded while the (first-time) probe was in flight.
          if (query !== currentQuery) return;
          if (query.trim().length >= SEMANTIC_MIN_QUERY_LENGTH) {
            semanticRunner.run(query);
          }
        });
      }

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
        // Exact groups first, then the deduped semantic "Related" section. When
        // the flag is off semanticCandidates stays empty, so this is exactly the
        // exact list — zero behavioral change on the shipped path.
        const items = mergeSemanticOptions(exactItems, semanticCandidates);
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
          command = props.command as unknown as (o: EntityMentionOption) => void;
          dismissed = false;
          runSearches(props.query);
          paint();
        },

        onUpdate: (props) => {
          if (props.clientRect) rect = toRect(props.clientRect());
          command = props.command as unknown as (o: EntityMentionOption) => void;
          // A new query re-arms a menu the user escaped out of: they've since
          // typed something, which means they want it back.
          dismissed = false;
          runSearches(props.query);
          paint();
        },

        onKeyDown: (props) => {
          if (!listRef.current) return false;
          return listRef.current.onKeyDown({ event: props.event });
        },

        onExit: () => {
          exactRunner.dispose();
          semanticRunner.dispose();
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
          exactItems = [];
          semanticCandidates = [];
          currentQuery = "";
        },
      };
    },
  };
}
