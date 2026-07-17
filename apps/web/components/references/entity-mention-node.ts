import Mention from "@tiptap/extension-mention";
import {
  ENTITY_MENTION_NODE,
  entityMentionAttrsToRef,
} from "@/lib/references/tiptap-tokens";
import { MENTION_KIND_GLYPH } from "@/lib/references/mention-list";
import { serializeReference } from "@/lib/references/token";
import { isEntityRefType } from "@/lib/references/token";

/**
 * The `entityMention` node — one inline chip pointing at one entity by id.
 *
 * Built on the Mention extension rather than a bare Node so it inherits the
 * suggestion-plugin wiring the other three chips already use (`#` hashtag,
 * `$` project, `@` person), and so it can coexist with them in the same editor
 * the way `projectMention` and `personMention` already do — distinct node name,
 * shared machinery.
 *
 * The attributes are deliberately NOT Mention's `id`/`label`. That `id` field
 * already carries two incompatible meanings in shipped code — the captures
 * composer stores a person's NAME in it (for resolve-or-create on save), while
 * JARVIS stores a person's UUID — and a reference whose id might be either
 * is exactly the ambiguity the S1 token exists to end. `refType`/`refId` say
 * what they hold.
 */
export const EntityMention = Mention.extend({
  name: ENTITY_MENTION_NODE,

  addAttributes() {
    return {
      refType: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-ref-type"),
        renderHTML: (attrs) =>
          attrs.refType ? { "data-ref-type": attrs.refType } : {},
      },
      refId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-ref-id"),
        renderHTML: (attrs) => (attrs.refId ? { "data-ref-id": attrs.refId } : {}),
      },
      label: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-label"),
        renderHTML: (attrs) => (attrs.label ? { "data-label": attrs.label } : {}),
      },
    };
  },

  /**
   * What `editor.getText()` produces for this node.
   *
   * Necessary but NOT sufficient: TipTap wires renderText into the schema's
   * toText serializer, which `doc.textContent` does not consult. Any save path
   * reading textContent still needs the JSON walk in tiptap-tokens.ts, or the
   * chip vanishes from the saved string.
   */
  renderText({ node }) {
    const ref = entityMentionAttrsToRef(node.attrs);
    return ref ? serializeReference(ref) : "";
  },
});

/**
 * The node's editor-side chip markup. Shared by every surface so a reference
 * looks the same in a capture, a task's notes, and the JARVIS composer.
 *
 * `.entity-chip-inline` takes the blue ink register — sage is the hashtag's and
 * amber is the legacy person chip's, so blue is what's left for "this points at
 * a thing in the app".
 */
export const ENTITY_MENTION_HTML_ATTRIBUTES = {
  class: "entity-chip-inline",
} as const;

export function renderEntityMentionHTML({
  options,
  node,
}: {
  options: { HTMLAttributes: Record<string, unknown> };
  node: { attrs: Record<string, unknown> };
}): [string, Record<string, unknown>, string] {
  const kind = isEntityRefType(node.attrs.refType) ? node.attrs.refType : null;
  const glyph = kind ? MENTION_KIND_GLYPH[kind] : "@";
  const label = typeof node.attrs.label === "string" ? node.attrs.label : "";
  return [
    "span",
    {
      ...options.HTMLAttributes,
      "data-ref-type": node.attrs.refType,
      "data-ref-id": node.attrs.refId,
    },
    `${glyph} ${label}`,
  ];
}
