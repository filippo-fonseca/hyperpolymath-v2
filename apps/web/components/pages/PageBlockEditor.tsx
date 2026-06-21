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
import { useCallback, useEffect, useRef } from "react";
import { KiwiIcon } from "@/components/shared/KiwiIcon";
import {
  JARVIS_ALIASES,
  JARVIS_LABEL,
  hasPromptBody,
  normalizePrompt,
} from "@/lib/jarvis/at-trigger";
import { invokeInDocumentJarvis } from "@/lib/jarvis/invoke-in-document";
import { formatReceiptSummary } from "@/lib/jarvis/receipt-summary";
import {
  JARVIS_RECEIPT_TYPE,
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

type Editor = BlockNoteEditor<
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
 * Insert a fresh @Jarvis prompt pill at the cursor (status "prompt"). The user
 * then types the instruction as normal text right after it, and Cmd+Enter
 * (handled in the wrapper keydown) submits the block's text through the seam.
 * Shared by the `@` autocomplete (JDOC-UX-01) and the `/Jarvis` slash item
 * (JDOC-UX-05).
 */
function insertJarvisPrompt(editor: Editor) {
  editor.insertInlineContent([
    {
      type: JARVIS_RECEIPT_TYPE,
      props: { prompt: "", status: "prompt", summary: "", turnId: "" },
    },
    // A trailing space so the user's instruction text reads after the pill.
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
  /** When true, resolved receipt pills are hidden in-doc (JDOC-UX-06). */
  hideReceipts?: boolean;
  /** Parent-owned ref populated with a "focus the body" fn (Enter-from-title). */
  focusRef?: React.MutableRefObject<(() => void) | null>;
  /**
   * Parent-owned ref to the editor wrapper. The in-page search (Phase 26) walks
   * the `.bn-editor` content DOM under it to highlight matches without touching
   * the document.
   */
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export default function PageBlockEditor({
  initialContentJson,
  initialMarkdown,
  theme,
  onChange,
  pageId,
  hideReceipts = false,
  focusRef,
  containerRef,
}: Props) {
  const editor = useCreateBlockNote({
    schema,
    initialContent: normalizeInitial(initialContentJson),
  });

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

  /**
   * Find the block the cursor sits in that carries a status="prompt" @Jarvis
   * pill, plus the instruction text typed alongside it. Returns null when there
   * is no prompt pill to submit. The instruction is the block's plain text
   * (the pill itself contributes none, being content:"none").
   */
  const findPromptInCursorBlock = useCallback(() => {
    const cursor = editor.getTextCursorPosition();
    const block = cursor?.block;
    if (!block || !Array.isArray(block.content)) return null;
    const pillIndex = block.content.findIndex(
      (c) =>
        typeof c === "object" &&
        c !== null &&
        "type" in c &&
        (c as { type?: string }).type === JARVIS_RECEIPT_TYPE &&
        (c as { props?: { status?: string } }).props?.status === "prompt",
    );
    if (pillIndex === -1) return null;
    // Block text minus the pill (pill emits no text); normalize away any stray
    // @token the user may have typed before the menu inserted the pill.
    const blockText = (block.content as Array<{ text?: string }>)
      .map((c) => (typeof c === "object" && c && "text" in c ? (c.text ?? "") : ""))
      .join("");
    return { block, pillIndex, prompt: normalizePrompt(blockText) };
  }, [editor]);

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
   * Submit the @Jarvis prompt in the cursor's block (Cmd+Enter, JDOC-UX-03):
   * flip the pill to loading, run invokeInDocumentJarvis (the Phase 31 seam),
   * then transform the pill into a receipt summary (or error). The typed
   * instruction text is cleared so only the pill remains.
   */
  const submitPrompt = useCallback(async () => {
    const found = findPromptInCursorBlock();
    if (!found) return false;
    const { block, pillIndex, prompt } = found;
    if (!hasPromptBody(prompt)) return false;

    // Loading state + stash the prompt on the pill so it survives the text wipe.
    updatePill(block.id, pillIndex, { status: "loading", prompt });
    // Drop the typed instruction: keep only the pill in the block.
    const pillNode = (block.content as unknown[])[pillIndex];
    editor.updateBlock(block.id, {
      content: [pillNode] as unknown as PartialBlock["content"],
    });

    try {
      const result = await invokeInDocumentJarvis({
        editor: editor as unknown as Parameters<
          typeof invokeInDocumentJarvis
        >[0]["editor"],
        cursorBlockId: block.id,
        prompt,
        pageId,
      });
      const summary = formatReceiptSummary(result.actions);
      updatePill(block.id, pillIndex, {
        status: "receipt",
        summary,
        turnId: result.turnId,
        prompt,
      });
    } catch (err) {
      updatePill(block.id, pillIndex, {
        status: "error",
        summary: err instanceof Error ? err.message : "JARVIS failed",
        prompt,
      });
    }
    return true;
  }, [editor, findPromptInCursorBlock, pageId, updatePill]);

  // Cmd/Ctrl+Enter is the ONLY way to submit an @Jarvis prompt (JDOC-UX-02).
  // Bound on the wrapper in capture phase so it pre-empts BlockNote's own Enter
  // handling when a prompt pill is present; otherwise it falls through.
  const handleWrapperKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "Enter") return;
      const found = findPromptInCursorBlock();
      if (!found || !hasPromptBody(found.prompt)) return;
      e.preventDefault();
      e.stopPropagation();
      void submitPrompt();
    },
    [findPromptInCursorBlock, submitPrompt],
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
    // biome-ignore lint/a11y/useKeyWithClickEvents: surface affordance mirrors the editor's own keyboard handling
    <div
      ref={containerRef}
      className="flex flex-1 flex-col cursor-text"
      data-hide-receipts={hideReceipts ? "true" : "false"}
      onMouseDown={handleSurfaceMouseDown}
      onKeyDownCapture={handleWrapperKeyDown}
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
