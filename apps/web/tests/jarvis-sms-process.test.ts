/**
 * Gate ordering for the inbound SMS processor.
 *
 * The expensive thing in this path is the Anthropic turn, and every acceptance
 * criterion for the channel is really a statement about when that turn is NOT
 * spent: on a Twilio retry, on a message from a stranger, on a reply looping
 * back from our own number, and while the settings toggle is off. Each of those
 * is asserted here as "runChannelTurn was never called", plus the ledger row
 * that records the reason, so silence is always explained.
 *
 * The database is a small in-memory fake rather than a live Postgres, so the
 * test runs anywhere. It models exactly the one behaviour that matters:
 * onConflictDoNothing().returning() gives back an empty array for a MessageSid
 * that has already been seen.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** message_sid -> row. The whole point is the primary-key conflict. */
const ledger = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const userRows = vi.hoisted(() => ({ current: [{ id: "user-1" }] as Array<{ id: string }> }));
const userUpdates = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@/lib/db", () => {
  const insert = (_table: unknown) => ({
    values: (row: Record<string, unknown>) => {
      const sid = String(row.messageSid);
      const isNew = !ledger.has(sid);
      if (isNew) ledger.set(sid, { ...row });
      return {
        onConflictDoNothing: () => ({
          returning: async () => (isNew ? [{ messageSid: sid }] : []),
        }),
      };
    },
  });

  const update = (table: { __name?: string }) => ({
    set: (patch: Record<string, unknown>) => ({
      where: () => {
        if (table.__name === "users") {
          userUpdates.push(patch);
        } else {
          // Ledger close: fold the patch onto whatever row exists.
          const [sid] = [...ledger.keys()].slice(-1);
          if (sid) ledger.set(sid, { ...ledger.get(sid), ...patch });
        }
        return Promise.resolve([]);
      },
    }),
  });

  // `.limit` hangs off both `from()` and `where()`: the owner lookup filters by
  // email, findSingleUserId does not filter at all.
  const rows = async () => userRows.current;
  const select = () => ({
    from: () => ({
      limit: rows,
      where: () => ({ limit: rows }),
    }),
  });

  return { db: { insert, update, select } };
});

// The two tables the processor writes are distinguished by a marker the fake
// reads; drizzle's own table symbols are awkward to match on.
vi.mock("@/lib/db/schema", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, users: { ...(actual.users as object), __name: "users" } };
});

const runChannelTurn = vi.hoisted(() =>
  vi.fn(async () => ({
    turnId: "turn-1",
    userTurnId: "user-turn-1",
    text: "Filed, sir.",
    actions: [] as Array<{ toolUseId: string; name: string; result: unknown }>,
    status: "done" as const,
    errorMessage: null,
  })),
);
vi.mock("@/lib/jarvis/run-channel-turn", () => ({ runChannelTurn }));

const sendSmsReply = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true as const, sids: ["SMout"], dryRun: true })),
);
vi.mock("@/lib/twilio/send", () => ({ sendSmsReply }));

const getMessagingSettings = vi.hoisted(() =>
  vi.fn(async () => ({
    enabled: true,
    lastReplyAt: null,
    lastStatus: null,
    lastError: null,
  })),
);
vi.mock("@/lib/db/queries/messaging", () => ({ getMessagingSettings }));

const { processInboundSms } = await import("@/lib/twilio/process-sms");

const ALLOWED = "+12035550148";
const OURS = "+12035550199";

function inbound(overrides: Partial<Parameters<typeof processInboundSms>[0]> = {}) {
  return {
    messageSid: `SM${Math.random().toString(16).slice(2)}`,
    from: ALLOWED,
    to: OURS,
    body: "add a task to call the dentist",
    mediaCount: 0,
    ...overrides,
  };
}

function lastLedgerRow(): Record<string, unknown> | undefined {
  return [...ledger.values()].slice(-1)[0];
}

beforeEach(() => {
  ledger.clear();
  userUpdates.length = 0;
  userRows.current = [{ id: "user-1" }];
  runChannelTurn.mockClear();
  sendSmsReply.mockClear();
  getMessagingSettings.mockClear();
  vi.stubEnv("JARVIS_SMS_ALLOWED_SENDERS", ALLOWED);
  vi.stubEnv("TWILIO_FROM_NUMBER", OURS);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("processInboundSms — the replay lock", () => {
  it("runs the turn exactly once for a repeated MessageSid", async () => {
    const msg = inbound();
    await expect(processInboundSms(msg)).resolves.toMatchObject({ status: "done" });
    await expect(processInboundSms(msg)).resolves.toEqual({ status: "duplicate" });
    expect(runChannelTurn).toHaveBeenCalledTimes(1);
    expect(ledger.size).toBe(1);
  });
});

describe("processInboundSms — gates that cost nothing", () => {
  it("ignores a sender outside the allowlist without an Anthropic call", async () => {
    const result = await processInboundSms(inbound({ from: "+12035550001" }));
    expect(result).toEqual({ status: "ignored_sender" });
    expect(runChannelTurn).not.toHaveBeenCalled();
    expect(sendSmsReply).not.toHaveBeenCalled();
    expect(lastLedgerRow()).toMatchObject({ status: "ignored_sender" });
  });

  it("breaks the loop when a message appears to come from our own number", async () => {
    vi.stubEnv("JARVIS_SMS_ALLOWED_SENDERS", `${ALLOWED},${OURS}`);
    const result = await processInboundSms(inbound({ from: OURS }));
    expect(result).toEqual({ status: "ignored_sender" });
    expect(runChannelTurn).not.toHaveBeenCalled();
    expect(String(lastLedgerRow()?.error)).toContain("loopback");
  });

  it("spends nothing while the settings toggle is off", async () => {
    getMessagingSettings.mockResolvedValueOnce({
      enabled: false,
      lastReplyAt: null,
      lastStatus: null,
      lastError: null,
    });
    const result = await processInboundSms(inbound());
    expect(result).toEqual({ status: "disabled" });
    expect(runChannelTurn).not.toHaveBeenCalled();
    expect(sendSmsReply).not.toHaveBeenCalled();
    expect(lastLedgerRow()).toMatchObject({ status: "disabled" });
  });

  it("checks the toggle BEFORE the turn, not merely before the send", async () => {
    getMessagingSettings.mockResolvedValueOnce({
      enabled: false,
      lastReplyAt: null,
      lastStatus: null,
      lastError: null,
    });
    await processInboundSms(inbound());
    // If the gate were placed after the turn, this would be 1.
    expect(runChannelTurn).toHaveBeenCalledTimes(0);
  });

  it("matches the allowlist regardless of the formatting Twilio sends", async () => {
    vi.stubEnv("JARVIS_SMS_ALLOWED_SENDERS", "(203) 555-0148");
    await expect(processInboundSms(inbound({ from: ALLOWED }))).resolves.toMatchObject({
      status: "done",
    });
  });
});

describe("processInboundSms — the reply", () => {
  it("sends the assistant prose and closes the ledger", async () => {
    const result = await processInboundSms(inbound());
    expect(result).toMatchObject({ status: "done", turnId: "turn-1" });
    expect(sendSmsReply).toHaveBeenCalledWith({ to: ALLOWED, body: "Filed, sir." });
    expect(lastLedgerRow()).toMatchObject({ status: "done", turnId: "turn-1" });
  });

  it("falls back to a receipt line when a pure tool turn produces no prose", async () => {
    runChannelTurn.mockResolvedValueOnce({
      turnId: "turn-2",
      userTurnId: "user-turn-2",
      text: "",
      actions: [
        { toolUseId: "a", name: "create_task", result: {} },
        { toolUseId: "b", name: "create_task", result: {} },
      ],
      status: "done",
      errorMessage: null,
    });
    await processInboundSms(inbound());
    expect(sendSmsReply).toHaveBeenCalledWith({ to: ALLOWED, body: "Created 2 tasks" });
  });

  it("tells the sender when an attachment arrived with no text", async () => {
    await processInboundSms(inbound({ body: "", mediaCount: 1 }));
    expect(runChannelTurn).not.toHaveBeenCalled();
    expect(String((sendSmsReply.mock.calls[0]?.[0] as { body: string }).body)).toContain(
      "cannot read images",
    );
  });

  it("records a failed turn in the ledger and warns the sender", async () => {
    runChannelTurn.mockResolvedValueOnce({
      turnId: "turn-3",
      userTurnId: "user-turn-3",
      text: "",
      actions: [],
      status: "error",
      errorMessage: "Anthropic exploded",
    });
    const result = await processInboundSms(inbound());
    expect(result).toMatchObject({ status: "error", error: "Anthropic exploded" });
    expect(lastLedgerRow()).toMatchObject({ status: "error" });
    expect(String((sendSmsReply.mock.calls[0]?.[0] as { body: string }).body)).toContain(
      "Something went wrong",
    );
  });

  it("records an error when no account can be resolved", async () => {
    userRows.current = [];
    const result = await processInboundSms(inbound());
    expect(result).toMatchObject({ status: "error" });
    expect(runChannelTurn).not.toHaveBeenCalled();
  });

  it("mirrors the outcome onto the user row for the settings surface", async () => {
    await processInboundSms(inbound());
    expect(userUpdates.at(-1)).toMatchObject({
      smsJarvisLastStatus: "done",
      smsJarvisLastError: null,
    });
  });
});
