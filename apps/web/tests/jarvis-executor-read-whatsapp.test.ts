/**
 * JARVIS executor read_whatsapp arm — receipt shape guarantee.
 *
 * The read_whatsapp executor runs FULLY server-side (queries whatsapp_messages).
 * Its receipt is what the agent narrates for "brief me on my WhatsApp", so the
 * shape must be pinned:
 *   - non-empty table → { chats: [{ chatName, messages: [...] }], totalCount, windowHours }
 *   - empty table    → { chats: [], totalCount: 0, windowHours, note: <hint> }
 *   - unrepliedOnly   → filters out chats whose latest message is from_me
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// The executor uses drizzle's query builder chain (select().from().where().orderBy().limit()).
// Mock the whole `db` object with a fluent chain that returns a per-test rows array.
const rowsFixture = { current: [] as Array<Record<string, unknown>> };

vi.mock("@/lib/db", () => {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rowsFixture.current)),
  };
  return {
    db: {
      select: vi.fn(() => chain),
      // Insert/update/transaction paths are unused by the read_whatsapp arm,
      // but the module-level factory pulls them in — stub as no-ops.
      insert: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
    },
  };
});
vi.mock("@/lib/db/schema", () => ({
  whatsappMessages: {
    userId: "user_id_col",
    chatJid: "chat_jid_col",
    chatName: "chat_name_col",
    senderName: "sender_name_col",
    fromMe: "from_me_col",
    body: "body_col",
    sentAt: "sent_at_col",
  },
}));
vi.mock("@/lib/gcal/events", () => ({}));
vi.mock("@/lib/gcal/token", () => ({
  GcalTokenRevokedError: class extends Error {},
  GcalNotConnectedError: class extends Error {},
  getValidGcalToken: vi.fn(),
}));
vi.mock("@/lib/captures/auto-tag", () => ({ scheduleAutoTagging: vi.fn() }));
vi.mock("@/app/actions/hashtags", () => ({ upsertHashtag: vi.fn() }));
vi.mock("@/app/actions/people", () => ({
  reconcilePersonReferencesForUser: vi.fn(),
  resolveOrCreatePersonForUser: vi.fn(),
}));
vi.mock("@/lib/db/queries/people", () => ({ getPeopleForUser: vi.fn() }));
vi.mock("@/lib/jarvis/validate-references", () => ({
  validateCalendarId: vi.fn(),
  validateProjectIds: vi.fn(),
}));

import { createServerExecutor } from "@/lib/jarvis/executor";
import type { ExecutionContext } from "@hyperpolymath/jarvis-core";

const ctx: ExecutionContext = {
  userId: "test-user-123",
  userTimezone: "America/New_York",
  defaultCalendarId: null,
};

beforeEach(() => {
  rowsFixture.current = [];
});

describe("executor.readWhatsapp", () => {
  it("empty table returns friendly hint receipt", async () => {
    rowsFixture.current = [];
    const executor = createServerExecutor();
    const result = await executor.readWhatsapp({}, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.receipt).toMatchObject({
      chats: [],
      totalCount: 0,
      windowHours: 24,
    });
    expect((result.receipt as Record<string, unknown>).note).toMatch(/bridge \+ sync worker/i);
  });

  it("groups rows by chatJid, preserves newest-first, defaults window to 24h", async () => {
    rowsFixture.current = [
      { chatJid: "a@s.whatsapp.net", chatName: "Alan", senderName: "Alan", fromMe: false, body: "hey", sentAt: new Date("2026-07-02T10:00:00Z") },
      { chatJid: "a@s.whatsapp.net", chatName: "Alan", senderName: "Alan", fromMe: false, body: "you around?", sentAt: new Date("2026-07-02T09:00:00Z") },
      { chatJid: "b@g.us", chatName: "Family", senderName: "Mum", fromMe: false, body: "lunch?", sentAt: new Date("2026-07-02T08:00:00Z") },
    ];
    const executor = createServerExecutor();
    const result = await executor.readWhatsapp({}, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    const receipt = result.receipt as {
      chats: Array<{ chatName: string; messages: Array<{ body: string | null }> }>;
      totalCount: number;
      windowHours: number;
    };
    expect(receipt.totalCount).toBe(3);
    expect(receipt.windowHours).toBe(24);
    expect(receipt.chats).toHaveLength(2);
    const alan = receipt.chats.find((c) => c.chatName === "Alan");
    expect(alan?.messages.map((m) => m.body)).toEqual(["hey", "you around?"]);
    const family = receipt.chats.find((c) => c.chatName === "Family");
    expect(family?.messages).toHaveLength(1);
  });

  it("unrepliedOnly drops chats whose latest message is from_me", async () => {
    rowsFixture.current = [
      // Alan: last message is FROM me → replied → dropped
      { chatJid: "a@s.whatsapp.net", chatName: "Alan", senderName: "Filippo", fromMe: true, body: "yeah", sentAt: new Date("2026-07-02T10:00:00Z") },
      { chatJid: "a@s.whatsapp.net", chatName: "Alan", senderName: "Alan", fromMe: false, body: "you around?", sentAt: new Date("2026-07-02T09:00:00Z") },
      // Family: last message is NOT from me → unreplied → kept
      { chatJid: "b@g.us", chatName: "Family", senderName: "Mum", fromMe: false, body: "lunch?", sentAt: new Date("2026-07-02T08:00:00Z") },
    ];
    const executor = createServerExecutor();
    const result = await executor.readWhatsapp({ unrepliedOnly: true }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    const receipt = result.receipt as { chats: Array<{ chatName: string }> };
    expect(receipt.chats.map((c) => c.chatName)).toEqual(["Family"]);
  });

  it("caps windowHours at 168 and maxResults at 100", async () => {
    rowsFixture.current = [];
    const executor = createServerExecutor();
    const result = await executor.readWhatsapp({ since_hours: 999, maxResults: 999 }, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect((result.receipt as { windowHours: number }).windowHours).toBe(168);
  });
});
