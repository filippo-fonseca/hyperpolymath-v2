import { describe, expect, it } from "vitest";
import {
  extractReferencesFromContentJson,
  nodeToReference,
} from "@/lib/references/page-refs";

const TASK_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const PERSON_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const PAGE_ID = "cccccccc-0000-4000-8000-000000000003";

const entityRef = (refKind: string, refId: string, label = "L") => ({
  type: "entityReference",
  props: { refKind, refId, label, emoji: "" },
});

const personMention = (personId: string, name = "Bo") => ({
  type: "personMention",
  props: { personId, name },
});

const paragraph = (content: unknown[]) => ({
  id: "block-1",
  type: "paragraph",
  props: {},
  content,
  children: [],
});

describe("nodeToReference", () => {
  it("reads a BlockNote entityReference via props.refKind", () => {
    expect(nodeToReference(entityRef("task", TASK_ID, "Ship it"))).toEqual({
      type: "task",
      id: TASK_ID,
      label: "Ship it",
    });
  });

  it("reads a BlockNote personMention as a person reference", () => {
    expect(nodeToReference(personMention(PERSON_ID, "Bo"))).toEqual({
      type: "person",
      id: PERSON_ID,
      label: "Bo",
    });
  });

  it("reads a TipTap entityMention via attrs.refType", () => {
    expect(
      nodeToReference({
        type: "entityMention",
        attrs: { refType: "page", refId: PAGE_ID, label: "Notes" },
      }),
    ).toEqual({ type: "page", id: PAGE_ID, label: "Notes" });
  });

  it("accepts the new capture and person kinds on an entityReference", () => {
    expect(nodeToReference(entityRef("capture", TASK_ID))?.type).toBe("capture");
    expect(nodeToReference(entityRef("person", PERSON_ID))?.type).toBe("person");
  });

  it("drops a node whose id is missing or the spec default", () => {
    // Both node specs default refId/personId to "", so a half-inserted node
    // would otherwise reconcile into a row pointing at nothing.
    expect(nodeToReference(entityRef("task", ""))).toBeNull();
    expect(nodeToReference(personMention(""))).toBeNull();
  });

  it("drops a node with an unsupported kind", () => {
    expect(nodeToReference(entityRef("event", TASK_ID))).toBeNull();
    expect(nodeToReference(entityRef("habit", TASK_ID))).toBeNull();
  });

  it("ignores ordinary nodes and non-nodes", () => {
    expect(nodeToReference({ type: "text", text: "hello" })).toBeNull();
    expect(nodeToReference({ type: "jarvisReceipt", props: {} })).toBeNull();
    expect(nodeToReference(null)).toBeNull();
    expect(nodeToReference("string")).toBeNull();
    expect(nodeToReference([])).toBeNull();
    expect(nodeToReference({ noType: true })).toBeNull();
  });
});

describe("extractReferencesFromContentJson", () => {
  it("finds references in a flat document, in order", () => {
    const doc = [
      paragraph([
        { type: "text", text: "ping " },
        personMention(PERSON_ID, "Bo"),
        { type: "text", text: " about " },
        entityRef("task", TASK_ID, "Ship it"),
      ]),
    ];
    expect(extractReferencesFromContentJson(doc)).toEqual([
      { type: "person", id: PERSON_ID, label: "Bo" },
      { type: "task", id: TASK_ID, label: "Ship it" },
    ]);
  });

  it("finds references nested in child blocks", () => {
    const doc = [
      {
        id: "b1",
        type: "bulletListItem",
        content: [{ type: "text", text: "outer" }],
        children: [paragraph([entityRef("page", PAGE_ID, "Notes")])],
      },
    ];
    expect(extractReferencesFromContentJson(doc)).toEqual([
      { type: "page", id: PAGE_ID, label: "Notes" },
    ]);
  });

  it("finds a reference nested inside a link", () => {
    // lib/people/extract-mentions.ts misses this one; a page saved with a
    // mention inside a link would silently unlink it.
    const doc = [
      paragraph([
        {
          type: "link",
          href: "https://example.com",
          content: [entityRef("task", TASK_ID, "Ship it")],
        },
      ]),
    ];
    expect(extractReferencesFromContentJson(doc)).toEqual([
      { type: "task", id: TASK_ID, label: "Ship it" },
    ]);
  });

  it("finds a reference inside a table cell", () => {
    // Neither existing walker reaches this.
    const doc = [
      {
        id: "t1",
        type: "table",
        content: {
          type: "tableContent",
          rows: [{ cells: [[personMention(PERSON_ID, "Bo")]] }],
        },
        children: [],
      },
    ];
    expect(extractReferencesFromContentJson(doc)).toEqual([
      { type: "person", id: PERSON_ID, label: "Bo" },
    ]);
  });

  it("dedupes a target referenced several times across the document", () => {
    const doc = [
      paragraph([entityRef("task", TASK_ID, "first")]),
      paragraph([entityRef("task", TASK_ID, "second")]),
    ];
    expect(extractReferencesFromContentJson(doc)).toEqual([
      { type: "task", id: TASK_ID, label: "first" },
    ]);
  });

  it("returns nothing for a legacy or empty document", () => {
    // content_json is nullable — null means a legacy page seeded from markdown.
    expect(extractReferencesFromContentJson(null)).toEqual([]);
    expect(extractReferencesFromContentJson(undefined)).toEqual([]);
    expect(extractReferencesFromContentJson([])).toEqual([]);
    expect(extractReferencesFromContentJson({})).toEqual([]);
  });

  it("does not throw on a malformed document", () => {
    // contentJson is typed `unknown` and validated by nothing, so the save
    // path must survive whatever is in the column.
    expect(extractReferencesFromContentJson("not a tree")).toEqual([]);
    expect(extractReferencesFromContentJson(42)).toEqual([]);
    expect(extractReferencesFromContentJson([null, undefined, 0, "x"])).toEqual([]);
    expect(
      extractReferencesFromContentJson([{ type: "paragraph", content: null }]),
    ).toEqual([]);
  });

  it("survives a pathologically deep tree", () => {
    let node: unknown = paragraph([entityRef("task", TASK_ID)]);
    for (let i = 0; i < 200; i++) node = { type: "wrap", children: [node] };
    expect(() => extractReferencesFromContentJson(node)).not.toThrow();
  });
});
