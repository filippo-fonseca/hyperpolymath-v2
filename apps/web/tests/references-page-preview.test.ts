import { describe, expect, it } from "vitest";
import { extractPreviewModel } from "@/lib/pages/preview";

const UUID_A = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const tok = (label: string, type = "project", id = UUID_A) =>
  `@[${label}](ref://${type}/${id})`;

/** The first block's text, which is what a thumbnail/inspector actually shows. */
function firstText(markdown: string): string {
  const model = extractPreviewModel(null, markdown);
  const block = model.blocks[0];
  return block && "text" in block ? block.text : "";
}

describe("page previews — reference tokens strip to their label", () => {
  it("strips a token to its label", () => {
    expect(firstText(`Training for ${tok("Marathon")} this fall`)).toBe(
      "Training for Marathon this fall",
    );
  });

  it("does not leave the token's @ stranded", () => {
    // The regression this guards: stripInlineMarkdown's markdown-link rule
    // matches the `[label](...)` half of a token, so running it first would
    // yield "@Marathon" — the reference syntax leaking into every thumbnail.
    const out = firstText(`See ${tok("Marathon")}.`);
    expect(out).not.toContain("@");
    expect(out).not.toContain("ref://");
    expect(out).toBe("See Marathon.");
  });

  it("strips several tokens in one line", () => {
    expect(firstText(`${tok("A")} then ${tok("B", "task")}`)).toBe("A then B");
  });

  it("leaves a real markdown link alone", () => {
    expect(firstText("see [the docs](https://example.com)")).toBe(
      "see the docs",
    );
  });

  it("keeps a plain email's @ intact", () => {
    expect(firstText("mail me@x.com about it")).toBe("mail me@x.com about it");
  });

  it("strips tokens inside a heading", () => {
    const model = extractPreviewModel(null, `# Plan for ${tok("Marathon")}`);
    expect(model.blocks[0]).toMatchObject({
      kind: "heading",
      text: "Plan for Marathon",
    });
  });

  it("strips tokens inside a bullet", () => {
    const model = extractPreviewModel(null, `- call ${tok("Ada", "person")}`);
    expect(model.blocks[0]).toMatchObject({
      kind: "bullet",
      text: "call Ada",
    });
  });

  it("strips tokens inside a todo", () => {
    const model = extractPreviewModel(null, `- [ ] ship ${tok("Marathon")}`);
    expect(model.blocks[0]).toMatchObject({
      kind: "todo",
      text: "ship Marathon",
      checked: false,
    });
  });

  it("strips tokens inside a quote", () => {
    const model = extractPreviewModel(null, `> per ${tok("Marathon")}`);
    expect(model.blocks[0]).toMatchObject({
      kind: "quote",
      text: "per Marathon",
    });
  });

  it("leaves an incomplete token as the literal text it is", () => {
    expect(firstText("@[Marathon](ref://ta")).toBe("@[Marathon](ref://ta");
  });

  it("leaves an unknown entity type alone", () => {
    const text = `@[Standup](ref://event/${UUID_A})`;
    // Not a token, so only the markdown-link rule touches it.
    expect(firstText(text)).toBe("@Standup");
  });

  it("still strips bold/italic/code around a token", () => {
    expect(firstText(`**bold** ${tok("Marathon")} \`code\``)).toBe(
      "bold Marathon code",
    );
  });

  it("handles a line that is nothing but a token", () => {
    expect(firstText(tok("Marathon"))).toBe("Marathon");
  });

  it("handles an empty label", () => {
    expect(firstText(`x @[](ref://task/${UUID_A}) y`)).toBe("x  y");
  });
});

describe("page previews — content_json entity nodes", () => {
  it("reads an entityReference node's label", () => {
    const model = extractPreviewModel([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Training for " },
          {
            type: "entityReference",
            props: { refKind: "project", refId: UUID_A, label: "Marathon" },
          },
        ],
      },
    ]);
    expect(model.blocks[0]).toMatchObject({
      kind: "paragraph",
      text: "Training for Marathon",
    });
  });
});
