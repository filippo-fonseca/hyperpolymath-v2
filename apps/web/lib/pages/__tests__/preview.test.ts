import { describe, expect, it } from "vitest";
import { extractPreviewModel } from "@/lib/pages/preview";

function text(value: string) {
  return { type: "text", text: value, styles: {} };
}

describe("extractPreviewModel", () => {
  it("extracts BlockNote headings, lists, todos, custom inline nodes, and unknown blocks", () => {
    const model = extractPreviewModel([
      {
        id: "h",
        type: "heading",
        props: { level: 2 },
        content: [text("Preview Engine")],
        children: [],
      },
      {
        id: "p",
        type: "paragraph",
        content: [
          text("Discuss "),
          {
            type: "personMention",
            props: { personId: "p1", name: "Ada" },
          },
          text(" and "),
          {
            type: "entityReference",
            props: {
              refKind: "project",
              refId: "pr1",
              label: "Wiki Explorer",
              emoji: "🧭",
            },
          },
        ],
        children: [],
      },
      {
        id: "b",
        type: "bulletListItem",
        content: [text("Parent item")],
        children: [
          {
            id: "child",
            type: "paragraph",
            content: [text("Nested note")],
            children: [],
          },
        ],
      },
      {
        id: "n",
        type: "numberedListItem",
        content: [text("First step")],
        children: [],
      },
      {
        id: "todo",
        type: "checkListItem",
        props: { checked: true },
        content: [text("Ship it")],
        children: [],
      },
      {
        id: "mystery",
        type: "callout",
        content: [text("Unknown degrades")],
        children: [],
      },
    ]);

    expect(model.blocks).toEqual([
      { kind: "heading", text: "Preview Engine", level: 2 },
      {
        kind: "paragraph",
        text: "Discuss @Ada and 🧭 Wiki Explorer",
      },
      { kind: "bullet", text: "Parent item", depth: undefined },
      { kind: "bullet", text: "Nested note", depth: 1 },
      { kind: "numbered", text: "First step", depth: undefined },
      { kind: "todo", text: "Ship it", checked: true },
      { kind: "paragraph", text: "Unknown degrades" },
    ]);
    expect(model.wordCount).toBe(17);
    expect(model.isEmpty).toBe(false);
  });

  it("handles code, image, divider, and table blocks without treating table content as inline content", () => {
    const model = extractPreviewModel([
      {
        id: "code",
        type: "codeBlock",
        props: { language: "ts" },
        content: [text("const value = 1;")],
        children: [],
      },
      {
        id: "image",
        type: "image",
        props: { url: "https://example.com/a.png", caption: "System sketch" },
        children: [],
      },
      {
        id: "divider",
        type: "divider",
        children: [],
      },
      {
        id: "table",
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            { cells: [[text("Name")], [text("Status")]] },
            { cells: [[text("Preview")], [text("Ready")]] },
          ],
        },
        children: [],
      },
    ]);

    expect(model.blocks).toEqual([
      { kind: "code", text: "const value = 1;", language: "ts" },
      {
        kind: "image",
        url: "https://example.com/a.png",
        caption: "System sketch",
      },
      { kind: "divider" },
      { kind: "table-hint", rows: 2, cols: 2 },
    ]);
    expect(model.wordCount).toBe(9);
  });

  it("falls back to markdown when contentJson is absent", () => {
    const model = extractPreviewModel(
      null,
      [
        "# Launch Notes",
        "",
        "Intro with [source](https://example.com).",
        "- [x] Draft preview",
        "- Bullet item",
        "1. Numbered item",
        "> Quoted line",
        "![Cover caption](https://example.com/cover.jpg)",
        "| A | B |",
        "---",
        "```ts",
        "const ok = true",
        "```",
      ].join("\n")
    );

    expect(model.blocks).toEqual([
      { kind: "heading", text: "Launch Notes", level: 1 },
      { kind: "paragraph", text: "Intro with source." },
      { kind: "todo", text: "Draft preview", checked: true },
      { kind: "bullet", text: "Bullet item" },
      { kind: "numbered", text: "Numbered item" },
      { kind: "quote", text: "Quoted line" },
      {
        kind: "image",
        url: "https://example.com/cover.jpg",
        caption: "Cover caption",
      },
      { kind: "table-hint", rows: 1, cols: 2 },
      { kind: "divider" },
      { kind: "code", text: "const ok = true", language: "ts" },
    ]);
    expect(model.wordCount).toBe(18);
    expect(model.isEmpty).toBe(false);
  });

  it("reports empty models for empty inputs and never throws on malformed inputs", () => {
    expect(extractPreviewModel(null, "")).toEqual({
      blocks: [],
      wordCount: 0,
      isEmpty: true,
    });

    expect(() =>
      extractPreviewModel([
        42,
        { type: "paragraph", content: "not inline" },
        { type: "table", content: { rows: "not rows" } },
      ])
    ).not.toThrow();
  });

  it("caps preview blocks and characters while keeping the full word count", () => {
    const model = extractPreviewModel(
      [
        {
          id: "one",
          type: "paragraph",
          content: [text("one two three four five six seven eight nine ten")],
          children: [],
        },
        {
          id: "two",
          type: "paragraph",
          content: [text("eleven twelve thirteen")],
          children: [],
        },
      ],
      null,
      { maxBlocks: 1, maxChars: 18 }
    );

    expect(model.blocks).toEqual([{ kind: "paragraph", text: "one two three f..." }]);
    expect(model.wordCount).toBe(13);
  });
});
