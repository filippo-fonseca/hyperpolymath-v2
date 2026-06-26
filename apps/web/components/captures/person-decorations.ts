import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

interface PersonLike {
  name: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build an `@name` matcher for the current known people, longest name first so
 * `@John Smith` wins over `@John`. Returns null when there are no people (so we
 * never decorate raw `@` — e.g. emails — that doesn't match a real person).
 */
function buildPersonRegex(people: PersonLike[]): RegExp | null {
  const names = people
    .map((p) => p.name)
    .filter((n) => n.length > 0)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  if (names.length === 0) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}_])@(?:${names.join("|")})(?![\\p{L}\\p{N}_])`, "gu");
}

function buildDecorations(doc: PMNode, people: PersonLike[]): DecorationSet {
  const re = buildPersonRegex(people);
  if (!re) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const from = pos + (m.index ?? 0);
      const to = from + m[0].length;
      decorations.push(Decoration.inline(from, to, { class: "person-chip-live" }));
    }
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Live `@person` rendering for capture/task inputs — the amber twin of
 * HashtagDecorations. Styles a plain `@name` text run the moment it matches a
 * known person, so the chip lands while typing without waiting for the
 * suggestion popover to commit a personMention node. Raw `@` that doesn't match
 * a person (emails, handles) is never decorated.
 *
 * `getPeople` is read on every doc change so the matcher tracks people created
 * inline during the session.
 */
export function createPersonDecorations(getPeople: () => PersonLike[]): Extension {
  return Extension.create({
    name: "personDecorations",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("personDecorations"),
          state: {
            init: (_, { doc }) => buildDecorations(doc, getPeople()),
            apply(tr, oldSet) {
              if (!tr.docChanged) return oldSet;
              return buildDecorations(tr.doc, getPeople());
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
}
