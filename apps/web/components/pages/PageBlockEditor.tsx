"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import "./page-block-editor.css";

import {
  type BlockNoteEditor,
  BlockNoteSchema,
  type PartialBlock,
  defaultBlockSpecs,
} from "@blocknote/core";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import {
  SuggestionMenuController,
  createReactBlockSpec,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useEffect, useRef } from "react";

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

interface Props {
  initialContentJson: unknown;
  initialMarkdown: string;
  theme: "light" | "dark";
  onChange: (json: unknown, markdown: string) => void;
  /** Parent-owned ref populated with a "focus the body" fn (Enter-from-title). */
  focusRef?: React.MutableRefObject<(() => void) | null>;
}

export default function PageBlockEditor({
  initialContentJson,
  initialMarkdown,
  theme,
  onChange,
  focusRef,
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
    <div className="flex flex-1 flex-col cursor-text" onMouseDown={handleSurfaceMouseDown}>
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
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [
                ...withSlashShorthand(getDefaultReactSlashMenuItems(editor)),
                insertCalloutItem(editor),
              ],
              query
            )
          }
        />
      </BlockNoteView>
    </div>
  );
}

function normalizeInitial(json: unknown): PartialBlock[] | undefined {
  if (Array.isArray(json) && json.length > 0) return json as PartialBlock[];
  return undefined;
}
