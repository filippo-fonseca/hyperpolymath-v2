import { describe, expect, it } from "vitest";

import {
  planAnnouncements,
  selectFresh,
  spokenLine,
  toastLine,
  type WatcherMessage,
} from "./notification-watcher";

const START = "2026-07-12T09:00:00.000Z";

function wa(sentAt: string, chatJid = "rohan@s.whatsapp.net", senderName = "Rohan", body = "hi"): WatcherMessage {
  return { channel: "whatsapp", chatJid, senderName, body, sentAt };
}
function im(sentAt: string, chatJid = "iMessage;-;+1555", senderName = "Ana", body = "yo"): WatcherMessage {
  return { channel: "imessage", chatJid, senderName, body, sentAt };
}

describe("selectFresh — watermark + start floor", () => {
  it("ignores messages older than the session start floor on first run (watermark null)", () => {
    const msgs = [wa("2026-07-12T08:59:59.000Z"), wa("2026-07-12T09:00:05.000Z")];
    const { fresh, watermark } = selectFresh(msgs, null, START);
    expect(fresh.map((m) => m.sentAt)).toEqual(["2026-07-12T09:00:05.000Z"]);
    expect(watermark).toBe("2026-07-12T09:00:05.000Z");
  });

  it("drops messages at or before an existing watermark", () => {
    const wm = "2026-07-12T09:00:10.000Z";
    const msgs = [wa("2026-07-12T09:00:10.000Z"), wa("2026-07-12T09:00:11.000Z")];
    const { fresh, watermark } = selectFresh(msgs, wm, START);
    expect(fresh.map((m) => m.sentAt)).toEqual(["2026-07-12T09:00:11.000Z"]);
    expect(watermark).toBe("2026-07-12T09:00:11.000Z");
  });

  it("returns fresh oldest-first regardless of input order", () => {
    const msgs = [wa("2026-07-12T09:00:30.000Z"), wa("2026-07-12T09:00:10.000Z"), wa("2026-07-12T09:00:20.000Z")];
    const { fresh } = selectFresh(msgs, null, START);
    expect(fresh.map((m) => m.sentAt)).toEqual([
      "2026-07-12T09:00:10.000Z",
      "2026-07-12T09:00:20.000Z",
      "2026-07-12T09:00:30.000Z",
    ]);
  });

  it("leaves the watermark unchanged when nothing is fresh", () => {
    const wm = "2026-07-12T09:05:00.000Z";
    const { fresh, watermark } = selectFresh([wa("2026-07-12T09:00:05.000Z")], wm, START);
    expect(fresh).toEqual([]);
    expect(watermark).toBe(wm);
  });

  it("tolerates malformed timestamps by treating them as epoch (dropped by floor)", () => {
    const { fresh } = selectFresh([wa("not-a-date")], null, START);
    expect(fresh).toEqual([]);
  });
});

describe("planAnnouncements — debounce / storm collapse", () => {
  it("emits one announcement per message under the spam threshold", () => {
    const fresh = [wa("2026-07-12T09:00:01.000Z"), wa("2026-07-12T09:00:02.000Z")];
    const plan = planAnnouncements(fresh);
    expect(plan).toHaveLength(2);
    expect(plan.every((a) => a.count === 1)).toBe(true);
  });

  it("collapses >3 messages from one chat within 10s into a single summary", () => {
    const fresh = [
      wa("2026-07-12T09:00:00.000Z"),
      wa("2026-07-12T09:00:02.000Z"),
      wa("2026-07-12T09:00:04.000Z"),
      wa("2026-07-12T09:00:06.000Z"),
      wa("2026-07-12T09:00:08.000Z"),
    ];
    const plan = planAnnouncements(fresh);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.count).toBe(5);
    expect(plan[0]!.body).toBeNull();
    expect(plan[0]!.sentAt).toBe("2026-07-12T09:00:08.000Z");
  });

  it("does NOT collapse a burst that exceeds the 10s window", () => {
    const fresh = [
      wa("2026-07-12T09:00:00.000Z"),
      wa("2026-07-12T09:00:04.000Z"),
      wa("2026-07-12T09:00:08.000Z"),
      wa("2026-07-12T09:00:15.000Z"),
    ];
    const plan = planAnnouncements(fresh);
    expect(plan).toHaveLength(4);
  });

  it("collapses per-chat independently, not across chats", () => {
    const storm = [
      wa("2026-07-12T09:00:00.000Z"),
      wa("2026-07-12T09:00:01.000Z"),
      wa("2026-07-12T09:00:02.000Z"),
      wa("2026-07-12T09:00:03.000Z"),
    ];
    const other = im("2026-07-12T09:00:05.000Z");
    const plan = planAnnouncements([...storm, other]);
    // One summary for the WA storm + one single for the iMessage.
    expect(plan).toHaveLength(2);
    const summary = plan.find((a) => a.channel === "whatsapp")!;
    expect(summary.count).toBe(4);
    const single = plan.find((a) => a.channel === "imessage")!;
    expect(single.count).toBe(1);
  });

  it("orders announcements by their latest message time", () => {
    const plan = planAnnouncements([
      im("2026-07-12T09:00:10.000Z"),
      wa("2026-07-12T09:00:01.000Z"),
    ]);
    expect(plan[0]!.channel).toBe("whatsapp");
    expect(plan[1]!.channel).toBe("imessage");
  });
});

describe("toastLine / spokenLine", () => {
  it("builds a compact toast for a single message", () => {
    const [a] = planAnnouncements([wa("2026-07-12T09:00:01.000Z", "rohan", "Rohan", "first message here")]);
    const line = toastLine(a!);
    expect(line).toEqual({ channel: "WhatsApp", sender: "Rohan", preview: "first message here" });
  });

  it("truncates a long toast body with an ellipsis", () => {
    const long = "x".repeat(200);
    const [a] = planAnnouncements([wa("2026-07-12T09:00:01.000Z", "rohan", "Rohan", long)]);
    const line = toastLine(a!, 80);
    expect(line.preview.endsWith("…")).toBe(true);
    expect(line.preview.length).toBeLessThanOrEqual(81);
  });

  it("summarizes a storm in the toast", () => {
    const fresh = [
      wa("2026-07-12T09:00:00.000Z", "fam@g.us", "Family"),
      wa("2026-07-12T09:00:01.000Z", "fam@g.us", "Family"),
      wa("2026-07-12T09:00:02.000Z", "fam@g.us", "Family"),
      wa("2026-07-12T09:00:03.000Z", "fam@g.us", "Family"),
    ];
    const [a] = planAnnouncements(fresh);
    expect(toastLine(a!).preview).toBe("4 new messages");
  });

  it("speaks in the butler register", () => {
    const [a] = planAnnouncements([wa("2026-07-12T09:00:01.000Z", "rohan", "Rohan", "hey")]);
    expect(spokenLine(a!)).toBe("Sir, Rohan on WhatsApp says: hey");
  });

  it("speaks a storm summary", () => {
    const fresh = [
      im("2026-07-12T09:00:00.000Z", "g", "Ana"),
      im("2026-07-12T09:00:01.000Z", "g", "Ana"),
      im("2026-07-12T09:00:02.000Z", "g", "Ana"),
      im("2026-07-12T09:00:03.000Z", "g", "Ana"),
    ];
    const [a] = planAnnouncements(fresh);
    expect(spokenLine(a!)).toBe("Sir, 4 new messages from Ana on iMessage.");
  });
});
