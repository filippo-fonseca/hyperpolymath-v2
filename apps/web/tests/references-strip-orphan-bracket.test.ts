/**
 * `stripOrphanBracket` repairs the stray `[` left after a `[[` wiki-link accept.
 *
 * The `[` suggestion menu is a one-character trigger, so `[[` runs it through
 * BlockNote twice and the accept only deletes `[query`, orphaning the first
 * `[`. `stripOrphanBracket` removes that orphan just before the chip is
 * inserted. What these tests pin, against a REAL editor rather than a hand-built
 * transaction:
 *   - a `[` immediately before the cursor is deleted (the orphan case),
 *   - a non-bracket character before the cursor is left untouched (so a `[query`
 *     BlockNote already deleted whole, or the `@` path, is never over-deleted),
 *   - a `[` that is NOT adjacent to the cursor is left untouched (a literal
 *     bracket typed elsewhere in the line survives).
 *
 * What they do NOT cover: the live trigger→re-trigger→accept sequence itself,
 * which needs a mounted ProseMirror view (a DOM) and is exercised in the
 * runtime rehearsal, not here.
 */

import { stripOrphanBracket } from "@/lib/references/strip-orphan-bracket";
import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";

/** Create a one-paragraph editor and type `text` so the cursor lands at its end. */
function editorWith(text: string) {
  const editor = BlockNoteEditor.create({
    initialContent: [{ type: "paragraph" }],
  });
  editor.insertInlineContent([text]);
  return editor;
}

/** The plain text of the first (only) paragraph. */
function firstParagraphText(editor: ReturnType<typeof editorWith>): string {
  const block = editor.document[0] as { content?: Array<{ text?: string }> };
  return (block.content ?? []).map((run) => run.text ?? "").join("");
}

describe("stripOrphanBracket", () => {
  it("deletes a `[` sitting immediately before the cursor", () => {
    const editor = editorWith("See [");
    stripOrphanBracket(editor);
    expect(firstParagraphText(editor)).toBe("See ");
  });

  it("leaves the text untouched when the cursor does not follow a `[`", () => {
    const editor = editorWith("See Research");
    stripOrphanBracket(editor);
    expect(firstParagraphText(editor)).toBe("See Research");
  });

  it("removes only ONE bracket, never a second one further back", () => {
    // Mirrors what BlockNote leaves after deleting `[query`: exactly one orphan
    // `[` abuts the cursor. A `[` earlier in the line must survive.
    const editor = editorWith("a [b [");
    stripOrphanBracket(editor);
    expect(firstParagraphText(editor)).toBe("a [b ");
  });
});
