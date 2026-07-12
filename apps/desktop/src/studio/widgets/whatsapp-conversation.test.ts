import { describe, expect, it } from "vitest";

import {
  buildConversationRows,
  dayLabel,
  isPendingReconciled,
  normalizeBody,
  pendingMatchesSynced,
  RECONCILE_RETRY_MS,
  RECONCILE_WINDOW_MS,
  type ConversationMessage,
  type MessageRow,
  type PendingSend,
} from "./whatsapp-conversation";

// A fixed "now" so relative day labels are deterministic. Built from local
// wall-clock components (not a `Z` string) so the day-boundary assertions hold
// regardless of the runner's timezone.
const NOW = new Date(2026, 6, 11, 18, 0, 0);

/** Local-time ISO for a given wall-clock instant — keeps day boundaries
 *  timezone-independent in these tests. */
function localIso(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s = 0,
): string {
  return new Date(y, mo, d, h, mi, s).toISOString();
}

function msg(partial: Partial<ConversationMessage> & { sentAt: string }): ConversationMessage {
  return { senderName: null, fromMe: false, body: "hi", ...partial };
}

function messageRows(rows: ReturnType<typeof buildConversationRows>): MessageRow[] {
  return rows.filter((r): r is MessageRow => r.kind === "message");
}

describe("dayLabel", () => {
  it("labels the current local day 'Today'", () => {
    expect(dayLabel(localIso(2026, 6, 11, 9, 15), NOW)).toBe("Today");
  });

  it("labels the prior local day 'Yesterday'", () => {
    expect(dayLabel(localIso(2026, 6, 10, 23, 0), NOW)).toBe("Yesterday");
  });

  it("labels an older same-year day with weekday + month + day (no year)", () => {
    const label = dayLabel(localIso(2026, 6, 3, 12, 0), NOW);
    expect(label).toMatch(/Jul 3/);
    expect(label).not.toMatch(/2026/);
  });

  it("appends the year for a different-year day", () => {
    expect(dayLabel(localIso(2023, 11, 31, 12, 0), NOW)).toMatch(/2023/);
  });

  it("returns empty string for an unparseable timestamp", () => {
    expect(dayLabel("not-a-date", NOW)).toBe("");
  });
});

describe("buildConversationRows — day separators", () => {
  it("inserts one separator before the first message of each new day", () => {
    const rows = buildConversationRows(
      [
        msg({ sentAt: localIso(2026, 6, 10, 10, 0) }),
        msg({ sentAt: localIso(2026, 6, 10, 10, 5) }),
        msg({ sentAt: localIso(2026, 6, 11, 9, 0) }),
      ],
      NOW,
    );
    const days = rows.filter((r) => r.kind === "day");
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ label: "Yesterday" });
    expect(days[1]).toMatchObject({ label: "Today" });
    // The very first row is a day separator, not a message.
    expect(rows[0]!.kind).toBe("day");
  });

  it("does not run yesterday and today together (a separator sits between them)", () => {
    const rows = buildConversationRows(
      [
        msg({ sentAt: localIso(2026, 6, 10, 23, 59), body: "last night" }),
        msg({ sentAt: localIso(2026, 6, 11, 0, 1), body: "this morning" }),
      ],
      NOW,
    );
    const kinds = rows.map((r) => r.kind);
    expect(kinds).toEqual(["day", "message", "day", "message"]);
  });
});

describe("buildConversationRows — clustering", () => {
  it("clusters consecutive same-sender messages within the 3-min window", () => {
    const rows = messageRows(
      buildConversationRows(
        [
          msg({ fromMe: true, sentAt: localIso(2026, 6, 11, 9, 0) }),
          msg({ fromMe: true, sentAt: localIso(2026, 6, 11, 9, 1) }),
          msg({ fromMe: true, sentAt: localIso(2026, 6, 11, 9, 2) }),
        ],
        NOW,
      ),
    );
    expect(rows.map((r) => r.clusterStart)).toEqual([true, false, false]);
    expect(rows.map((r) => r.clusterEnd)).toEqual([false, false, true]);
  });

  it("breaks a cluster when the sender changes", () => {
    const rows = messageRows(
      buildConversationRows(
        [
          msg({ fromMe: true, sentAt: localIso(2026, 6, 11, 9, 0) }),
          msg({ fromMe: false, senderName: "Rohan", sentAt: localIso(2026, 6, 11, 9, 0, 30) }),
        ],
        NOW,
      ),
    );
    expect(rows.map((r) => r.clusterStart)).toEqual([true, true]);
    expect(rows.map((r) => r.clusterEnd)).toEqual([true, true]);
  });

  it("breaks a cluster when the gap exceeds the window", () => {
    const rows = messageRows(
      buildConversationRows(
        [
          msg({ fromMe: true, sentAt: localIso(2026, 6, 11, 9, 0) }),
          msg({ fromMe: true, sentAt: localIso(2026, 6, 11, 9, 10) }),
        ],
        NOW,
      ),
    );
    expect(rows.map((r) => r.clusterStart)).toEqual([true, true]);
  });

  it("breaks a cluster across a day boundary even within 3 minutes", () => {
    const rows = messageRows(
      buildConversationRows(
        [
          msg({ fromMe: true, sentAt: localIso(2026, 6, 10, 23, 59) }),
          msg({ fromMe: true, sentAt: localIso(2026, 6, 11, 0, 0, 30) }),
        ],
        NOW,
      ),
    );
    expect(rows.map((r) => r.clusterStart)).toEqual([true, true]);
  });

  it("keeps every bubble's own timestamp (message identity preserved)", () => {
    const rows = messageRows(
      buildConversationRows([msg({ sentAt: localIso(2026, 6, 11, 9, 0), body: "solo" })], NOW),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.message.body).toBe("solo");
    expect(rows[0]!.clusterStart).toBe(true);
    expect(rows[0]!.clusterEnd).toBe(true);
  });

  it("returns an empty list for no messages", () => {
    expect(buildConversationRows([], NOW)).toEqual([]);
  });
});

describe("normalizeBody", () => {
  it("collapses whitespace, trims, and lowercases", () => {
    expect(normalizeBody("  Hey   There\n")).toBe("hey there");
  });
  it("treats null/undefined as empty", () => {
    expect(normalizeBody(null)).toBe("");
    expect(normalizeBody(undefined)).toBe("");
  });
});

describe("pendingMatchesSynced — reconcile predicate", () => {
  const at = (mi: number, s = 0) => localIso(2026, 6, 11, 12, mi, s);
  const pending: PendingSend = { body: "on my way", sentAt: at(0) };

  it("matches a from-me synced row with the same body within ±90s", () => {
    // Bridge stamp trailing the local clock by 30s — a realistic drift.
    const synced = msg({ fromMe: true, body: "on my way", sentAt: at(0, 30) });
    expect(pendingMatchesSynced(pending, synced)).toBe(true);
  });

  it("matches despite whitespace / case differences in the body", () => {
    const synced = msg({ fromMe: true, body: "  On My Way ", sentAt: at(0, 5) });
    expect(pendingMatchesSynced(pending, synced)).toBe(true);
  });

  it("rejects an incoming (not-from-me) row with the same body", () => {
    const synced = msg({ fromMe: false, body: "on my way", sentAt: at(0, 5) });
    expect(pendingMatchesSynced(pending, synced)).toBe(false);
  });

  it("rejects a different body", () => {
    const synced = msg({ fromMe: true, body: "see you soon", sentAt: at(0, 5) });
    expect(pendingMatchesSynced(pending, synced)).toBe(false);
  });

  it("rejects a same-text row outside the ±90s window (a genuine repeat)", () => {
    const synced = msg({ fromMe: true, body: "on my way", sentAt: at(2, 0) });
    expect(pendingMatchesSynced(pending, synced)).toBe(false);
  });

  it("matches at exactly the window edge and rejects just beyond it", () => {
    const edge = new Date(new Date(pending.sentAt).getTime() + RECONCILE_WINDOW_MS).toISOString();
    const past = new Date(
      new Date(pending.sentAt).getTime() + RECONCILE_WINDOW_MS + 1_000,
    ).toISOString();
    expect(pendingMatchesSynced(pending, msg({ fromMe: true, body: "on my way", sentAt: edge }))).toBe(true);
    expect(pendingMatchesSynced(pending, msg({ fromMe: true, body: "on my way", sentAt: past }))).toBe(false);
  });

  it("rejects a row with an unparseable timestamp", () => {
    expect(pendingMatchesSynced(pending, msg({ fromMe: true, body: "on my way", sentAt: "nope" }))).toBe(false);
  });
});

describe("isPendingReconciled", () => {
  const pending: PendingSend = { body: "hello", sentAt: localIso(2026, 6, 11, 12, 0) };

  it("is true once the synced history contains the matching from-me row", () => {
    const fetched = [
      msg({ fromMe: false, body: "hey", sentAt: localIso(2026, 6, 11, 11, 59) }),
      msg({ fromMe: true, body: "hello", sentAt: localIso(2026, 6, 11, 12, 0, 12) }),
    ];
    expect(isPendingReconciled(pending, fetched)).toBe(true);
  });

  it("is false when no synced row matches yet", () => {
    const fetched = [msg({ fromMe: false, body: "hey", sentAt: localIso(2026, 6, 11, 11, 59) })];
    expect(isPendingReconciled(pending, fetched)).toBe(false);
  });
});

describe("RECONCILE_RETRY_MS — retry schedule", () => {
  it("is strictly increasing and bounded to ~60s", () => {
    for (let i = 1; i < RECONCILE_RETRY_MS.length; i++) {
      expect(RECONCILE_RETRY_MS[i]!).toBeGreaterThan(RECONCILE_RETRY_MS[i - 1]!);
    }
    expect(RECONCILE_RETRY_MS[RECONCILE_RETRY_MS.length - 1]).toBe(60_000);
  });

  it("starts well before the ~15s sync-worker cadence", () => {
    expect(RECONCILE_RETRY_MS[0]!).toBeLessThan(15_000);
  });
});
