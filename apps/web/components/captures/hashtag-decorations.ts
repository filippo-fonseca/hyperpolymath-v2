import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Same regex used by CaptureComposer.parseEditor / CaptureDetailPanel.parseEditorJSON
// so what the user *sees* highlighted matches what the save path persists.
const HASHTAG_RE = /(?<![\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu;

function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    HASHTAG_RE.lastIndex = 0;
    for (const m of text.matchAll(HASHTAG_RE)) {
      const from = pos + (m.index ?? 0);
      const to = from + m[0].length;
      decorations.push(Decoration.inline(from, to, { class: "hashtag-chip-live" }));
    }
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Live hashtag rendering for capture inputs (closes #41).
 *
 * The TipTap Mention extension only styles a `#hashtag` once the user has
 * committed it via the suggestion popover (which generally requires Enter).
 * Plain typed `#word` text reads as ordinary serif until commit, even though
 * the save-path parser already treats it as a tag and the filter sidebar
 * already finds it. This decoration plugin closes that visual gap by wrapping
 * every `#word` text match in an inline span carrying `.hashtag-chip-live`,
 * rebuilt on each doc change.
 *
 * Decorations don't modify the document — Mention nodes, the suggestion
 * popover, and parseEditor stay unchanged. Mention node text lives in
 * `node.attrs.label` (not as a text node in the doc), so this scanner never
 * double-styles a committed mention.
 */
export const HashtagDecorations = Extension.create({
  name: "hashtagDecorations",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("hashtagDecorations"),
        state: {
          init: (_, { doc }) => buildDecorations(doc),
          apply(tr, oldSet) {
            if (!tr.docChanged) return oldSet;
            return buildDecorations(tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
