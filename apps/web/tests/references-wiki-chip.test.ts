/**
 * The wiki entity-reference chip carries every S1 kind (S8).
 *
 * A note on what these tests are and are not worth, so nobody reads more
 * assurance into them than they hold. BlockNote 0.51.4 does NOT enforce a
 * propSchema's `values` list at runtime — verified directly against this
 * version: a node whose `refKind` sits outside the list loads, inserts, and
 * survives an HTML round trip exactly like a listed one. `values` is a
 * type-level constraint, so the real guard on the kind extension is `tsc`, not
 * these tests, and they would still pass against the old four-kind list.
 *
 * What they do earn: they pin the persisted node SHAPE (the props a chip must
 * carry for content_json to stay reconcilable) against a real editor rather
 * than a hand-built object, they prove a legacy personMention still loads
 * untouched, and they hold the glyph map total over the token's kinds — the one
 * assertion here that fails on a plausible mistake.
 */

import {
  ENTITY_REFERENCE_TYPE,
  entityReferenceInlineSpec,
} from "@/components/pages/EntityReferenceInline";
import {
  PERSON_MENTION_TYPE,
  personMentionInlineSpec,
} from "@/components/pages/PersonMentionInline";
import { ENTITY_KIND_GLYPH, ENTITY_KIND_PLURAL } from "@/lib/references/glyphs";
import { extractReferencesFromContentJson } from "@/lib/references/page-refs";
import { ENTITY_REF_TYPES } from "@/lib/references/token";
import {
  BlockNoteEditor,
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import { describe, expect, it } from "vitest";

const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    [PERSON_MENTION_TYPE]: personMentionInlineSpec,
    [ENTITY_REFERENCE_TYPE]: entityReferenceInlineSpec,
  },
});

const ID = "11111111-1111-4111-8111-111111111111";

/** Insert `content` through the editor's own insertion path and read it back. */
function insertInline(content: unknown[]): Array<Record<string, unknown>> {
  const editor = BlockNoteEditor.create({
    schema,
    initialContent: [{ type: "paragraph" }] as never,
  });
  editor.insertInlineContent(content as never);
  const block = editor.document[0] as { content?: unknown };
  return (Array.isArray(block.content) ? block.content : []) as Array<Record<string, unknown>>;
}

function chip(kind: string, label: string) {
  return {
    type: ENTITY_REFERENCE_TYPE,
    props: { refKind: kind, refId: ID, label, emoji: "" },
  };
}

describe("entityReference kinds", () => {
  it.each([...ENTITY_REF_TYPES])("persists the full reference shape for kind %s", (kind) => {
    const [node] = insertInline([chip(kind, `A ${kind}`)]);
    expect(node.type).toBe(ENTITY_REFERENCE_TYPE);
    // All three of kind/id/label must survive: the walker reconciles from
    // refKind+refId, and label is the snapshot a tombstone falls back to.
    expect(node.props).toMatchObject({
      refKind: kind,
      refId: ID,
      label: `A ${kind}`,
    });
  });

  it("still loads a legacy personMention node untouched", () => {
    const [node] = insertInline([
      { type: PERSON_MENTION_TYPE, props: { personId: ID, name: "Ada" } },
    ]);
    expect(node.type).toBe(PERSON_MENTION_TYPE);
    expect(node.props).toMatchObject({ personId: ID, name: "Ada" });
  });

  it("maps every kind the token grammar admits to a glyph and a group label", () => {
    for (const kind of ENTITY_REF_TYPES) {
      expect(ENTITY_KIND_GLYPH[kind], `glyph for ${kind}`).toBeTruthy();
      expect(ENTITY_KIND_PLURAL[kind], `group label for ${kind}`).toBeTruthy();
    }
    // A person reads as "@" whichever node carries it — the legacy pill and the
    // new chip must not diverge on the same entity.
    expect(ENTITY_KIND_GLYPH.person).toBe("@");
  });
});

/**
 * The walker reads what the editor actually writes.
 *
 * The page-refs suite already covers the extended kinds, but against hand-built
 * fixtures — objects a human wrote to look like editor output. That leaves one
 * seam untested: if the editor's real persisted shape ever drifted from those
 * fixtures, both suites would stay green while every reference on every page
 * silently stopped reconciling. These drive the document through a real editor
 * and hand THAT to the walker, which is the pairing the save path performs.
 */
describe("the wiki chip against U1's walker", () => {
  it("links every kind the @ menu can insert", () => {
    const editor = BlockNoteEditor.create({
      schema,
      initialContent: [{ type: "paragraph" }] as never,
    });
    for (const kind of ENTITY_REF_TYPES) {
      editor.insertInlineContent([chip(kind, `A ${kind}`), " "] as never);
    }
    // ENTITY_REF_TYPES shares one id across kinds, so dedupe (which keys on
    // type+id) must still keep all six: they are six distinct targets.
    const refs = extractReferencesFromContentJson(editor.document);
    expect(refs.map((r) => r.type).sort()).toEqual([...ENTITY_REF_TYPES].sort());
  });

  it("links a legacy personMention written by the old @ menu", () => {
    const editor = BlockNoteEditor.create({
      schema,
      initialContent: [{ type: "paragraph" }] as never,
    });
    editor.insertInlineContent([
      { type: PERSON_MENTION_TYPE, props: { personId: ID, name: "Ada" } },
    ] as never);
    expect(extractReferencesFromContentJson(editor.document)).toEqual([
      { type: "person", id: ID, label: "Ada" },
    ]);
  });
});
