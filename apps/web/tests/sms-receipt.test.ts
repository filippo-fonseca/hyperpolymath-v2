import { composeSmsReply, formatSmsReceipt } from "@/lib/jarvis/sms-receipt";
import { describe, expect, it } from "vitest";

const created = (name: string, title: string) => ({
  name,
  result: { ok: true, receipt: { title } },
});

describe("formatSmsReceipt", () => {
  it("names a single created thing", () => {
    expect(formatSmsReceipt([created("create_task", "Call the lab")])).toBe(
      "Added “Call the lab” to your tasks."
    );
  });

  it("names a small batch", () => {
    expect(
      formatSmsReceipt([
        created("create_task", "Call the lab"),
        created("create_task", "Book a room"),
      ])
    ).toBe("Added 2 tasks: “Call the lab” and “Book a room”.");
  });

  it("falls back to counting past three", () => {
    const many = Array.from({ length: 4 }, (_, i) => created("create_task", `T${i}`));
    expect(formatSmsReceipt(many)).toBe("Added 4 tasks.");
  });

  it("joins different kinds into one sentence", () => {
    expect(
      formatSmsReceipt([created("create_task", "Call the lab"), created("create_event", "Dentist")])
    ).toBe("Added “Call the lab” to your tasks and added “Dentist” to your events.");
  });

  it("uses 'note' for a capture and reads its content", () => {
    expect(
      formatSmsReceipt([
        { name: "create_capture", result: { ok: true, receipt: { content: "idea" } } },
      ])
    ).toBe("Added “idea” to your notes.");
  });

  it("ignores reads and failures", () => {
    expect(formatSmsReceipt([{ name: "list_tasks", result: { ok: true } }])).toBeNull();
    expect(
      formatSmsReceipt([{ name: "create_task", result: { ok: false, receipt: { title: "x" } } }])
    ).toBeNull();
  });

  it("parses a JSON-string result (replayed from jarvis_turns)", () => {
    expect(
      formatSmsReceipt([
        {
          name: "create_task",
          result: JSON.stringify({ ok: true, receipt: { title: "Ship it" } }),
        },
      ])
    ).toBe("Added “Ship it” to your tasks.");
  });

  it("survives a malformed result rather than throwing", () => {
    expect(formatSmsReceipt([{ name: "create_task", result: "not json" }])).toBe("Added 1 task.");
  });
});

describe("composeSmsReply", () => {
  it("appends the receipt to prose that omits it", () => {
    const out = composeSmsReply("Loud and clear, sir.", [created("create_task", "Call the lab")]);
    expect(out).toBe("Loud and clear, sir.\n\nAdded “Call the lab” to your tasks.");
  });

  it("does not repeat what the prose already named", () => {
    const out = composeSmsReply('I filed "Call the lab" for you, sir.', [
      created("create_task", "Call the lab"),
    ]);
    expect(out).toBe('I filed "Call the lab" for you, sir.');
  });

  it("returns the receipt alone for a pure tool turn", () => {
    expect(composeSmsReply("", [created("create_task", "Call the lab")])).toBe(
      "Added “Call the lab” to your tasks."
    );
  });

  it("passes prose through untouched when nothing changed", () => {
    expect(composeSmsReply("You have three meetings today, sir.", [])).toBe(
      "You have three meetings today, sir."
    );
  });

  it("never returns empty", () => {
    expect(composeSmsReply("", [])).toBe("Done, sir.");
  });
});
