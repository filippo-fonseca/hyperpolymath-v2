import { describe, expect, it } from "vitest";
import { formatReceiptSummary } from "@/lib/jarvis/receipt-summary";

describe("formatReceiptSummary", () => {
  it("returns 'No changes' for an empty list", () => {
    expect(formatReceiptSummary([])).toBe("No changes");
  });

  it("formats a single created task (singular)", () => {
    expect(formatReceiptSummary([{ name: "create_task" }])).toBe("Created 1 task");
  });

  it("pluralizes and groups by verb+noun, preserving first-seen order", () => {
    const out = formatReceiptSummary([
      { name: "create_task" },
      { name: "create_event" },
      { name: "create_event" },
    ]);
    expect(out).toBe("Created 1 task, Created 2 events");
  });

  it("maps edit/update verbs to 'Edited' and pluralizes captures", () => {
    const out = formatReceiptSummary([
      { name: "edit_capture" },
      { name: "edit_capture" },
      { name: "edit_capture" },
    ]);
    expect(out).toBe("Edited 3 captures");
  });

  it("handles the documented mixed receipt line", () => {
    const out = formatReceiptSummary([
      { name: "create_task" },
      { name: "create_event" },
      { name: "create_event" },
      { name: "edit_capture" },
      { name: "edit_capture" },
      { name: "edit_capture" },
    ]);
    expect(out).toBe("Created 1 task, Created 2 events, Edited 3 captures");
  });

  it("pluralizes -y nouns to -ies", () => {
    const out = formatReceiptSummary([
      { name: "create_entry" },
      { name: "create_entry" },
    ]);
    expect(out).toBe("Created 2 entries");
  });

  it("falls back to title-cased verb and raw noun for unknown tools", () => {
    expect(formatReceiptSummary([{ name: "archive_widget" }])).toBe(
      "Archive 1 widget",
    );
  });
});
