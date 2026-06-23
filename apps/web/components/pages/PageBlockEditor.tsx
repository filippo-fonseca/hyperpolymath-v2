"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import "./page-block-editor.css";

import {
  type BlockNoteEditor,
  BlockNoteSchema,
  type PartialBlock,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import {
  type DefaultReactSuggestionItem,
  SuggestionMenuController,
  createReactBlockSpec,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { invalidateAfterJarvisAction } from "@/lib/jarvis/invalidate-after-action";
import { useQueryClient } from "@tanstack/react-query";
import { KiwiIcon } from "@/components/shared/KiwiIcon";
import {
  JARVIS_ALIASES,
  JARVIS_LABEL,
  hasPromptBody,
} from "@/lib/jarvis/at-trigger";
import {
  type InDocumentAction,
  invokeInDocumentJarvis,
} from "@/lib/jarvis/invoke-in-document";
import { formatReceiptSummary } from "@/lib/jarvis/receipt-summary";
import { undoJarvisAction } from "@/app/actions/jarvis";
import { actionToUndoTarget } from "@/lib/jarvis/action-to-undo-target";
import {
  JARVIS_RECEIPT_TYPE,
  type JarvisPillProps,
  JarvisPillProvider,
  jarvisReceiptInlineSpec,
} from "./JarvisReceiptInline";

// Notion-style callout: a leading emoji plus editable inline content on a
// tinted surface. Not a standard markdown block — it degrades to its inner
// text in the markdown mirror, but keeps full fidelity in content_json.
const calloutBlock = createReactBlockSpec(
  {
    type: "callout",
    content: "inline",
    propSchema: { emoji: { default: "💡" } },
  },
  {
    render: (props) => (
      <div className="bn-callout">
        <span className="bn-callout-emoji" contentEditable={false}>
          {props.block.props.emoji}
        </span>
        <div className="bn-callout-body" ref={props.contentRef} />
      </div>
    ),
  }
)();

const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, callout: calloutBlock },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    [JARVIS_RECEIPT_TYPE]: jarvisReceiptInlineSpec,
  },
});

export type Editor = BlockNoteEditor<
  typeof schema.blockSchema,
  typeof schema.inlineContentSchema,
  typeof schema.styleSchema
>;

function insertCalloutItem(editor: Editor) {
  return {
    title: "Callout",
    subtext: "Highlight a note, tip, or warning",
    aliases: ["callout", "note", "info", "tip", "warning"],
    group: "Basic blocks",
    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "callout" }),
  };
}

// Terse shorthand the slash menu should accept so `/h1`, `/todo`, etc. resolve
// straight to the matching block. `filterSuggestionItems` matches a query
// against each item's title + aliases, so we extend the default items' aliases.
// Keyed by the default item title (matched case-insensitively to survive any
// casing drift in BlockNote's labels). Default titles per @blocknote/react:
// "Heading 1/2/3", "Bullet List", "Numbered List", "Check List", "Quote",
// "Code Block".
const SLASH_SHORTHAND: Record<string, string[]> = {
  "heading 1": ["h1"],
  "heading 2": ["h2"],
  "heading 3": ["h3"],
  "bullet list": ["bullet"],
  "numbered list": ["numbered"],
  "check list": ["todo"],
  quote: ["quote"],
  "code block": ["code"],
};

/**
 * Clone each default slash item, appending our shorthand aliases where the
 * item's title matches. Non-destructive: spreads the item and its existing
 * aliases so the defaults keep working untouched.
 */
function withSlashShorthand<T extends { title: string; aliases?: readonly string[] }>(
  items: T[],
): T[] {
  return items.map((item) => {
    const extra = SLASH_SHORTHAND[item.title.toLowerCase()];
    if (!extra) return item;
    return { ...item, aliases: [...(item.aliases ?? []), ...extra] };
  });
}

/**
 * Insert a fresh @Jarvis prompt pill at the cursor (status "prompt"). The pill
 * is itself an editable input (see JarvisReceiptInline): focus moves INTO it,
 * the user types their message there, and Cmd/Ctrl+Enter submits it through the
 * JarvisPillContext seam. Shared by the `@` autocomplete (JDOC-UX-01) and the
 * `/Jarvis` slash item (JDOC-UX-05).
 */
function insertJarvisPrompt(editor: Editor) {
  editor.insertInlineContent([
    {
      type: JARVIS_RECEIPT_TYPE,
      props: { prompt: "", status: "prompt", summary: "", turnId: "" },
    },
    // A trailing space so the cursor can leave the pill afterward and the
    // resolved receipt reads cleanly inline.
    " ",
  ]);
}

interface Props {
  initialContentJson: unknown;
  initialMarkdown: string;
  theme: "light" | "dark";
  onChange: (json: unknown, markdown: string) => void;
  /** The page id, forwarded to the in-document JARVIS seam. */
  pageId: string;
  /**
   * The authenticated user id. Used after an in-document undo to invalidate the
   * TanStack Query keys the reversed actions touch (tasks/captures/calendar),
   * mirroring the console — purely additive over the Realtime echo.
   */
  userId: string;
  /** When true, resolved receipt pills are hidden in-doc (JDOC-UX-06). */
  hideReceipts?: boolean;
  /**
   * When true, drop the cursor into the first content block on mount instead of
   * leaving focus on the title. Daily Pages open with a date title already set,
   * so the user wants to start writing the body straight away.
   */
  autoFocusFirstBlock?: boolean;
  /** Parent-owned ref populated with a "focus the body" fn (Enter-from-title). */
  focusRef?: React.MutableRefObject<(() => void) | null>;
  /**
   * Parent-owned ref to the editor wrapper. The in-page search (Phase 26) walks
   * the `.bn-editor` content DOM under it to highlight matches without touching
   * the document.
   */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /**
   * Hand the live BlockNote editor to the parent once created (Phase 30). The
   * Daily Page "process this page" button needs the editor to run the WHOLE
   * page through the in-document JARVIS engine. Called with `null` on unmount.
   */
  onEditorReady?: (editor: Editor | null) => void;
}

export default function PageBlockEditor({
  initialContentJson,
  initialMarkdown,
  theme,
  onChange,
  pageId,
  userId,
  hideReceipts = false,
  autoFocusFirstBlock = false,
  focusRef,
  containerRef,
  onEditorReady,
}: Props) {
  const editor = useCreateBlockNote({
    schema,
    initialContent: normalizeInitial(initialContentJson),
  });

  const queryClient = useQueryClient();

  // Executed actions per resolved turn, keyed by turnId. Populated when a turn
  // resolves (submitPill success) so the receipt pill's 5s undo can invert the
  // SAME actions the console would, via the SAME server path. Held in a ref —
  // it's read on demand by the undo handler and never needs to trigger a render
  // (the pill re-reads via isUndoable on the next render after props change).
  // The undone set tracks turns already reversed so a double-click is a no-op.
  const turnActionsRef = useRef<Map<string, InDocumentAction[]>>(new Map());
  const undoneTurnsRef = useRef<Set<string>>(new Set());

  // Expose the live editor to the parent (Phase 30). Done in an effect so the
  // parent only ever sees the editor after mount, and gets a null on cleanup.
  useEffect(() => {
    onEditorReady?.(editor);
    return () => {
      onEditorReady?.(null);
    };
  }, [editor, onEditorReady]);

  // Legacy pages have no content_json — seed the document once from the
  // existing markdown mirror so old pages open as blocks. The resulting
  // onChange persists the converted JSON, completing the migration in place.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const hasJson = Array.isArray(initialContentJson) && initialContentJson.length > 0;
    if (!hasJson && initialMarkdown.trim()) {
      void (async () => {
        const blocks = await editor.tryParseMarkdownToBlocks(initialMarkdown);
        editor.replaceBlocks(editor.document, blocks);
      })();
    }
  }, [editor, initialContentJson, initialMarkdown]);

  // Expose a "focus the body" handle to the parent so pressing Enter in the
  // title jumps the cursor into the first block, treating title + body as one
  // continuous writing flow.
  useEffect(() => {
    if (!focusRef) return;
    focusRef.current = () => {
      const first = editor.document[0];
      if (first) editor.setTextCursorPosition(first.id, "start");
      editor.focus();
    };
    return () => {
      focusRef.current = null;
    };
  }, [editor, focusRef]);

  // Daily Pages open with a date title already filled in, so the user wants the
  // cursor in the body, not the title. Drop it into the first content block once
  // on mount. Done here (not in the parent) because the editor is loaded async
  // via next/dynamic — its focus handle isn't ready when the parent first mounts.
  const autoFocused = useRef(false);
  useEffect(() => {
    if (!autoFocusFirstBlock || autoFocused.current) return;
    autoFocused.current = true;
    const first = editor.document[0];
    if (first) editor.setTextCursorPosition(first.id, "start");
    editor.focus();
  }, [autoFocusFirstBlock, editor]);

  /**
   * Locate a still-editable @Jarvis prompt pill in the document, matching the
   * exact node props identity the pill's input handed us on submit. Returns the
   * owning block id + the pill's index within that block's content array.
   *
   * We match by props identity first (the React render passes the live
   * `props.inlineContent.props` object straight through), then fall back to the
   * sole status="prompt" pill — there is normally at most one being edited.
   */
  const locatePromptPill = useCallback(
    (nodeProps: JarvisPillProps) => {
      let fallback: { blockId: string; pillIndex: number } | null = null;
      let promptPillCount = 0;
      for (const block of editor.document) {
        if (!Array.isArray(block.content)) continue;
        for (let i = 0; i < block.content.length; i++) {
          const c = block.content[i] as {
            type?: string;
            props?: JarvisPillProps;
          };
          if (
            c?.type !== JARVIS_RECEIPT_TYPE ||
            c.props?.status !== "prompt"
          ) {
            continue;
          }
          promptPillCount++;
          if (c.props === nodeProps) {
            return { blockId: block.id, pillIndex: i };
          }
          if (!fallback) fallback = { blockId: block.id, pillIndex: i };
        }
      }
      // Only trust the fallback when it is unambiguous (a single prompt pill).
      return promptPillCount === 1 ? fallback : null;
    },
    [editor],
  );

  /** Update a pill's props in place by walking the block's content array. */
  const updatePill = useCallback(
    (
      blockId: string,
      pillIndex: number,
      props: { status?: string; summary?: string; turnId?: string; prompt?: string },
    ) => {
      const block = editor.document.find((b) => b.id === blockId);
      if (!block || !Array.isArray(block.content)) return;
      const nextContent = block.content.map((c, i) => {
        if (i !== pillIndex) return c;
        const node = c as { type?: string; props?: Record<string, unknown> };
        return { ...node, props: { ...node.props, ...props } };
      });
      // updateBlock with the rebuilt content array; cast through the editor's
      // partial-block shape (the rebuilt nodes are valid inline content).
      editor.updateBlock(blockId, {
        content: nextContent as unknown as PartialBlock["content"],
      });
    },
    [editor],
  );

  /**
   * Submit the typed pill prompt (Cmd/Ctrl+Enter from inside the pill input,
   * JDOC-UX-03): flip the pill to loading (so editing stops + spinner shows),
   * run invokeInDocumentJarvis (the Phase 31 seam), then transform the pill
   * into a receipt summary (or error). The original prompt is stashed on the
   * pill so it survives as the hover tooltip.
   */
  const submitPill = useCallback(
    (rawPrompt: string, nodeProps: JarvisPillProps) => {
      const prompt = rawPrompt.trim();
      if (!hasPromptBody(prompt)) return;
      const located = locatePromptPill(nodeProps);
      if (!located) return;
      const { blockId, pillIndex } = located;

      // Loading state + stash the prompt so it survives as the tooltip.
      updatePill(blockId, pillIndex, { status: "loading", prompt });

      void (async () => {
        try {
          const result = await invokeInDocumentJarvis({
            editor: editor as unknown as Parameters<
              typeof invokeInDocumentJarvis
            >[0]["editor"],
            cursorBlockId: blockId,
            prompt,
            pageId,
          });
          const summary = formatReceiptSummary(result.actions);
          // Stash the executed actions so the receipt pill's 5s undo can invert
          // them via the shared server path. Keyed by the persisted turnId.
          if (result.turnId) {
            turnActionsRef.current.set(result.turnId, result.actions);
          }
          updatePill(blockId, pillIndex, {
            status: "receipt",
            summary,
            turnId: result.turnId,
            prompt,
          });
        } catch (err) {
          updatePill(blockId, pillIndex, {
            status: "error",
            summary: err instanceof Error ? err.message : "JARVIS failed",
            prompt,
          });
        }
      })();
    },
    [editor, locatePromptPill, pageId, updatePill],
  );

  /**
   * Does this resolved turn have any reversible action? Same capability gate
   * the console applies: an action is undoable iff actionToUndoTarget returns a
   * non-null target (create/update/delete with the needed before/snapshot).
   * Already-undone turns report false so the affordance won't re-appear.
   */
  const isTurnUndoable = useCallback((turnId: string): boolean => {
    if (undoneTurnsRef.current.has(turnId)) return false;
    const actions = turnActionsRef.current.get(turnId);
    if (!actions || actions.length === 0) return false;
    return actions.some((a) => actionToUndoTarget(a) !== null);
  }, []);

  /**
   * Reverse a resolved in-document turn's executed actions — the SAME 5s
   * universal undo the console offers (Phase 16). For each action we build its
   * UndoTarget via the shared mapper and call the SAME server action the
   * console uses (undoJarvisAction → undoJarvisActionForUser). This never
   * touches the in-flight request: the turn has already completed and persisted
   * by the time a receipt (and thus this affordance) exists. We only invert the
   * results. Returns true if at least one action was reversed.
   */
  const undoTurn = useCallback(
    async (turnId: string): Promise<boolean> => {
      if (undoneTurnsRef.current.has(turnId)) return true;
      const actions = turnActionsRef.current.get(turnId);
      if (!actions || actions.length === 0) return false;

      // Mark undone up-front so a second click (or a re-render) is a no-op.
      undoneTurnsRef.current.add(turnId);

      let anyReversed = false;
      for (const action of actions) {
        const target = actionToUndoTarget(action);
        if (!target) continue;
        const res = await undoJarvisAction(target);
        if (res.ok) {
          anyReversed = true;
          // Refresh the lists the reversed action touched (mirrors console);
          // additive over the Realtime echo, and required for gcal events.
          invalidateAfterJarvisAction(queryClient, action.name, userId);
        }
      }
      if (!anyReversed) {
        // Nothing actually reversed (every inversion failed) — allow a retry.
        undoneTurnsRef.current.delete(turnId);
      }
      return anyReversed;
    },
    [queryClient, userId],
  );

  // The seam the pill's editable input + receipt undo call into.
  const pillContextValue = useMemo(
    () => ({ submit: submitPill, undo: undoTurn, isUndoable: isTurnUndoable }),
    [submitPill, undoTurn, isTurnUndoable],
  );

  // Notion-style "click anywhere to write": a click that lands on the empty
  // surface (not on a block, side menu, or popover) drops the cursor at the
  // end of the document, appending a trailing paragraph if the last block
  // already holds content.
  function handleSurfaceMouseDown(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (
      target.closest(".bn-block-content") ||
      target.closest(".bn-side-menu") ||
      target.closest(".bn-suggestion-menu") ||
      target.closest(".bn-formatting-toolbar")
    ) {
      return;
    }
    const blocks = editor.document;
    const last = blocks[blocks.length - 1];
    if (!last) return;
    e.preventDefault();
    const isEmptyParagraph =
      last.type === "paragraph" && Array.isArray(last.content) && last.content.length === 0;
    if (isEmptyParagraph) {
      editor.setTextCursorPosition(last.id, "end");
    } else {
      const inserted = editor.insertBlocks([{ type: "paragraph" }], last.id, "after");
      const newBlock = inserted[0];
      if (newBlock) editor.setTextCursorPosition(newBlock.id, "end");
    }
    editor.focus();
  }

  return (
    // The pill provider exposes the Cmd/Ctrl+Enter submit seam to every pill
    // input rendered inside the editor (JDOC-UX-03). Cmd/Ctrl+Enter is handled
    // inside the pill input itself, which stops the event so BlockNote never
    // sees it — no wrapper-level key handler is needed anymore.
    <JarvisPillProvider value={pillContextValue}>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: surface affordance mirrors the editor's own keyboard handling */}
      <div
        ref={containerRef}
        className="flex flex-1 flex-col cursor-text"
        data-hide-receipts={hideReceipts ? "true" : "false"}
        onMouseDown={handleSurfaceMouseDown}
      >
        <BlockNoteView
          editor={editor}
          theme={theme}
          slashMenu={false}
          onChange={() => {
            void (async () => {
              const markdown = await editor.blocksToMarkdownLossy(editor.document);
              onChange(editor.document, markdown);
            })();
          }}
        >
          {/* `/` slash menu — defaults + callout + the /Jarvis invocation. */}
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                [
                  ...withSlashShorthand(getDefaultReactSlashMenuItems(editor)),
                  insertCalloutItem(editor),
                  jarvisSlashItem(editor),
                ],
                query
              )
            }
          />
          {/* `@` autocomplete — JARVIS only (JDOC-UX-01). */}
          <SuggestionMenuController
            triggerCharacter="@"
            getItems={async (query) =>
              filterSuggestionItems([jarvisAtItem(editor)], query)
            }
          />
        </BlockNoteView>
      </div>
    </JarvisPillProvider>
  );
}

/** `/Jarvis` slash item with the agent glyph (JDOC-UX-05). */
function jarvisSlashItem(editor: Editor): DefaultReactSuggestionItem {
  return {
    title: JARVIS_LABEL,
    subtext: "Ask JARVIS to act on this page",
    aliases: ["jarvis", ...JARVIS_ALIASES],
    group: "AI",
    icon: <KiwiIcon size={15} />,
    onItemClick: () => insertJarvisPrompt(editor),
  };
}

/** The single JARVIS item shown by the `@` autocomplete (JDOC-UX-01). */
function jarvisAtItem(editor: Editor): DefaultReactSuggestionItem {
  return {
    title: JARVIS_LABEL,
    subtext: "Invoke JARVIS in this document",
    aliases: [...JARVIS_ALIASES],
    icon: <KiwiIcon size={15} />,
    onItemClick: () => insertJarvisPrompt(editor),
  };
}

function normalizeInitial(json: unknown): PartialBlock[] | undefined {
  if (Array.isArray(json) && json.length > 0) return json as PartialBlock[];
  return undefined;
}
