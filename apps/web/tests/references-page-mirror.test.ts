/**
 * The page markdown mirror serializes reference nodes as S1 tokens (S8).
 *
 * Two layers, tested separately on purpose:
 *
 *   - The transform itself (pure, no editor): the tree rewrite.
 *   - The END-TO-END mirror (real BlockNote editor, the app's real schema):
 *     content_json fixture -> the exact string that lands in pages.content.
 *
 * The end-to-end half is the one that matters. The whole design rests on a
 * claim about a third party — that a token in a text node survives the
 * exporter's markdown escaping byte-identically — and a pure test of my own
 * function cannot check that claim. If a BlockNote upgrade starts escaping the
 * brackets, only these tests fail, and pages.content quietly stops being
 * parseable everywhere else.
 */

import {
  BlockNoteEditor,
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from "@blocknote/core";
import { describe, expect, it } from "vitest";
import {
  ENTITY_REFERENCE_TYPE,
  entityReferenceInlineSpec,
} from "@/components/pages/EntityReferenceInline";
import {
  PERSON_MENTION_TYPE,
  personMentionInlineSpec,
} from "@/components/pages/PersonMentionInline";
import { blocksWithReferenceTokens } from "@/lib/references/page-mirror";
import { parseReferences, serializeReference } from "@/lib/references/token";

const schema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    [PERSON_MENTION_TYPE]: personMentionInlineSpec,
    [ENTITY_REFERENCE_TYPE]: entityReferenceInlineSpec,
  },
});

const PAGE_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const CAPTURE_ID = "33333333-3333-4333-8333-333333333333";

const text = (t: string) => ({ type: "text", text: t, styles: {} });
const ref = (kind: string, id: string, label: string, emoji = "") => ({
  type: ENTITY_REFERENCE_TYPE,
  props: { refKind: kind, refId: id, label, emoji },
});
const person = (id: string, name: string) => ({
  type: PERSON_MENTION_TYPE,
  props: { personId: id, name },
});

/** The real mirror path: exactly what PageBlockEditor's onChange computes. */
async function mirror(blocks: unknown[]): Promise<string> {
  const editor = BlockNoteEditor.create({
    schema,
    initialContent: blocks as never,
  });
  return await editor.blocksToMarkdownLossy(
    blocksWithReferenceTokens(editor.document) as never,
  );
}

const para = (content: unknown[]) => ({ type: "paragraph", content });

describe("blocksWithReferenceTokens", () => {
  it("does not mutate the input — content_json must keep the real nodes", () => {
    const doc = [para([ref("page", PAGE_ID, "Marathon")])];
    const snapshot = JSON.stringify(doc);
    blocksWithReferenceTokens(doc);
    expect(JSON.stringify(doc)).toBe(snapshot);
  });

  it("replaces a reference node with a text node holding its token", () => {
    const out = blocksWithReferenceTokens([
      para([ref("page", PAGE_ID, "Marathon")]),
    ]) as Array<{ content: unknown[] }>;
    expect(out[0].content).toEqual([
      {
        type: "text",
        text: `@[Marathon](ref://page/${PAGE_ID})`,
        styles: {},
      },
    ]);
  });

  it("reaches a reference nested inside a link, not just a top-level one", () => {
    const out = blocksWithReferenceTokens([
      para([
        {
          type: "link",
          href: "https://example.com",
          content: [ref("task", PAGE_ID, "Deep")],
        },
      ]),
    ]) as Array<{ content: Array<{ content: unknown[] }> }>;
    expect(out[0].content[0].content).toEqual([
      { type: "text", text: `@[Deep](ref://task/${PAGE_ID})`, styles: {} },
    ]);
  });

  it("leaves a tree with no references structurally identical", () => {
    const doc = [para([text("just prose")])];
    expect(blocksWithReferenceTokens(doc)).toEqual(doc);
  });

  it("drops a half-inserted node with no id rather than emitting a broken token", () => {
    // Both specs default refId to "", so an incomplete node is reachable. The
    // walker refuses it, and the mirror must agree — a token pointing at
    // nothing is worse than no token.
    const out = blocksWithReferenceTokens([
      para([ref("page", "", "Ghost")]),
    ]) as Array<{ content: Array<{ type: string }> }>;
    expect(out[0].content[0].type).toBe(ENTITY_REFERENCE_TYPE);
  });
});

describe("the mirror pages.content actually receives", () => {
  it("serializes an entityReference as its canonical token", async () => {
    const md = await mirror([
      para([text("see "), ref("page", PAGE_ID, "Marathon"), text(" today")]),
    ]);
    expect(md.trim()).toBe(
      `see @[Marathon](ref://page/${PAGE_ID}) today`,
    );
  });

  it("serializes a legacy personMention as a person token, id and all", async () => {
    // The old mirror emitted the bare text "@Ada": the name survived, the id
    // did not, so nothing downstream could resolve it back to a person.
    const md = await mirror([para([text("ask "), person(PERSON_ID, "Ada")])]);
    expect(md.trim()).toBe(`ask @[Ada](ref://person/${PERSON_ID})`);
  });

  it("serializes the new capture and person kinds", async () => {
    const md = await mirror([
      para([
        ref("capture", CAPTURE_ID, "A jotted thought"),
        text(" "),
        ref("person", PERSON_ID, "Ada"),
      ]),
    ]);
    expect(md.trim()).toBe(
      `@[A jotted thought](ref://capture/${CAPTURE_ID}) @[Ada](ref://person/${PERSON_ID})`,
    );
  });

  it("emits the emoji-bearing chip's label only, never its emoji", async () => {
    // The label is the S1 display snapshot. The emoji is chrome the chip draws;
    // folding it into the token would make the stored label differ from the
    // entity's real title.
    const md = await mirror([para([ref("area", PAGE_ID, "Health", "🌱")])]);
    expect(md.trim()).toBe(`@[Health](ref://area/${PAGE_ID})`);
  });

  it("round-trips through parseReferences — the point of the whole exercise", async () => {
    const md = await mirror([
      para([text("A "), ref("page", PAGE_ID, "Marathon")]),
      para([person(PERSON_ID, "Ada")]),
      para([ref("capture", CAPTURE_ID, "Jot")]),
    ]);
    expect(parseReferences(md).map((r) => ({ type: r.type, id: r.id }))).toEqual(
      [
        { type: "page", id: PAGE_ID },
        { type: "person", id: PERSON_ID },
        { type: "capture", id: CAPTURE_ID },
      ],
    );
  });

  it("survives labels markdown would want to escape", async () => {
    // The load-bearing third-party claim: remark must not escape the token's
    // own punctuation, whatever the label contains.
    for (const label of [
      "a*b*c",
      "a_b_c",
      "a (b) c",
      "50% & <x>",
      "Ünïcode ✓",
      "",
    ]) {
      const md = await mirror([para([ref("page", PAGE_ID, label)])]);
      expect(md.trim(), `label ${JSON.stringify(label)}`).toBe(
        serializeReference({ type: "page", id: PAGE_ID, label }),
      );
      expect(parseReferences(md)).toHaveLength(1);
    }
  });

  it("keeps a token intact when the chip sits inside a styled run", async () => {
    const md = await mirror([
      para([
        { type: "text", text: "bold ", styles: { bold: true } },
        ref("page", PAGE_ID, "Marathon"),
      ]),
    ]);
    expect(parseReferences(md)).toHaveLength(1);
  });

  it("is deterministic — the same document mirrors to the same string", async () => {
    const doc = [
      para([text("see "), ref("page", PAGE_ID, "Marathon"), text(" and ")]),
      para([person(PERSON_ID, "Ada")]),
    ];
    expect(await mirror(doc)).toBe(await mirror(doc));
  });

  it("leaves prose that merely looks like a token alone", async () => {
    const md = await mirror([para([text("email me @ ada@example.com [x](y)")])]);
    expect(parseReferences(md)).toHaveLength(0);
  });
});
