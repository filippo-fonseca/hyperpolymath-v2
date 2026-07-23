import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from "@blocknote/core";

/**
 * Delete a single literal `[` sitting immediately before the cursor.
 *
 * The wiki-link menu is a one-character trigger (`[`), so `[[` muscle memory
 * runs it through BlockNote twice: the second `[` re-fires the trigger, which
 * re-anchors the query at that second bracket. On accept BlockNote therefore
 * deletes only `[query` and orphans the FIRST `[`, so the reference persists as
 * `See [@[Research Notes](ref://page/…)` and previews read "See [ Research
 * Notes". Call this immediately before inserting the reference chip so the
 * stray bracket is removed and the result matches the single-character `@`
 * path.
 *
 * It is a no-op unless the character directly before the cursor is `[`: a
 * single `[` typed for any other reason (or a `[query` that BlockNote already
 * deleted whole) leaves a non-bracket character before the cursor and is never
 * touched.
 */
export function stripOrphanBracket<
  B extends BlockSchema,
  I extends InlineContentSchema,
  S extends StyleSchema,
>(editor: BlockNoteEditor<B, I, S>): void {
  editor.transact((tr) => {
    const { from } = tr.selection;
    if (from > 0 && tr.doc.textBetween(from - 1, from) === "[") {
      tr.delete(from - 1, from);
    }
  });
}
