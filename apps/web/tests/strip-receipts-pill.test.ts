import { describe, expect, it } from "vitest";
import { receiptToMarkdownComment } from "@/lib/jarvis/receipt-markdown";
import { stripReceipts } from "@/lib/pages/markdown-export";

describe("receipt pill markdown is stripped from exports (JDOC-UX-06)", () => {
  it("strips a serialized receipt pill to empty", () => {
    const md = receiptToMarkdownComment("Created 1 task, Created 2 events");
    expect(stripReceipts(md).trim()).toBe("");
  });

  it("strips receipt pills embedded between real content, keeping the content", () => {
    const md = [
      "# My page",
      "",
      "Some real prose.",
      receiptToMarkdownComment("Edited 3 captures"),
      "More prose.",
      "",
    ].join("\n");
    const out = stripReceipts(md);
    expect(out).toContain("# My page");
    expect(out).toContain("Some real prose.");
    expect(out).toContain("More prose.");
    expect(out).not.toContain("jarvis:receipt");
    expect(out).not.toContain("Edited 3 captures");
  });

  it("strips multiple receipt pills in one document", () => {
    const md = [
      receiptToMarkdownComment("Created 1 task"),
      "between",
      receiptToMarkdownComment("Created 2 events"),
    ].join("\n");
    const out = stripReceipts(md);
    expect(out).not.toContain("jarvis:receipt");
    expect(out).not.toContain("Created 1 task");
    expect(out).not.toContain("Created 2 events");
    expect(out).toContain("between");
  });
});
