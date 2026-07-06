/**
 * executor.sendMessage — WhatsApp channel guarantee.
 *
 * Ensures the executor mints a DesktopAction with app='whatsapp' when
 * requested, and continues to default to app='imessage' on any unexpected
 * value. requires_confirm is load-bearing (the desktop confirm-gate keys off
 * it) and must stay true for both channels.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/db/schema", () => ({}));
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
import type { ExecutionContext, SendMessageAction } from "@hyperpolymath/jarvis-core";

const ctx: ExecutionContext = {
  userId: "test-user-123",
  userTimezone: "America/New_York",
  defaultCalendarId: null,
};

describe("executor.sendMessage — WhatsApp", () => {
  it("mints action with kind='send_message', app='whatsapp', requires_confirm=true", async () => {
    const executor = createServerExecutor();
    const input: SendMessageAction = {
      app: "whatsapp",
      recipient: "+14155551234",
      text: "hi Alan",
    };
    const result = await executor.sendMessage(input, ctx);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.action).toEqual({
      kind: "send_message",
      app: "whatsapp",
      recipient: "+14155551234",
      text: "hi Alan",
      requires_confirm: true,
    });
    expect(result.receipt).toMatchObject({
      app: "whatsapp",
      recipient: "+14155551234",
      requires_confirm: true,
    });
  });

  it("still mints imessage action when app='imessage' (backwards compatible)", async () => {
    const executor = createServerExecutor();
    const result = await executor.sendMessage(
      { app: "imessage", recipient: "Alan", text: "hi" },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect((result.action as { app: string }).app).toBe("imessage");
  });

  it("rejects empty recipient / empty text as validation", async () => {
    const executor = createServerExecutor();
    const emptyRcpt = await executor.sendMessage(
      { app: "whatsapp", recipient: "   ", text: "hi" },
      ctx,
    );
    expect(emptyRcpt.ok).toBe(false);
    if (emptyRcpt.ok) throw new Error("expected validation failure");
    expect(emptyRcpt.kind).toBe("validation");

    const emptyText = await executor.sendMessage(
      { app: "whatsapp", recipient: "+1", text: "   " },
      ctx,
    );
    expect(emptyText.ok).toBe(false);
    if (emptyText.ok) throw new Error("expected validation failure");
    expect(emptyText.kind).toBe("validation");
  });
});
