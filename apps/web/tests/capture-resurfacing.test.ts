/**
 * Resurfacing (remind-me) — JARVIS date wiring.
 *
 * Two layers, no real Supabase / Anthropic:
 *  1. Tool schemas accept the new `resurface_at` field (create + update).
 *  2. The server executor persists it: createCapture writes resurfaceAt into
 *     the insert; updateCapture sets it from an ISO string and clears it with "".
 *
 * The db is mocked with a fluent transaction that captures the values/set
 * objects handed to Drizzle, mirroring the existing executor tests.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateCaptureInputSchema, zCreateCaptureFor } from "@hyperpolymath/jarvis-core/tools";

// --- schema layer (pure) ---------------------------------------------------

describe("resurface_at tool schemas", () => {
  it("create_capture accepts an ISO datetime with offset", () => {
    const parsed = zCreateCaptureFor({}).safeParse({
      content: "ship the thing",
      resurface_at: "2026-07-14T00:00:00-04:00",
    });
    expect(parsed.success).toBe(true);
  });

  it("create_capture allows omitting resurface_at", () => {
    const parsed = zCreateCaptureFor({}).safeParse({ content: "no reminder" });
    expect(parsed.success).toBe(true);
  });

  it("create_capture rejects a non-datetime resurface_at", () => {
    const parsed = zCreateCaptureFor({}).safeParse({
      content: "bad date",
      resurface_at: "next tuesday",
    });
    expect(parsed.success).toBe(false);
  });

  it("update_capture accepts resurface_at set, clear (\"\"), and unchanged (null)", () => {
    expect(
      UpdateCaptureInputSchema.safeParse({
        id: "c1",
        content: null,
        resurface_at: "2026-07-14T00:00:00-04:00",
      }).success,
    ).toBe(true);
    expect(
      UpdateCaptureInputSchema.safeParse({ id: "c1", content: null, resurface_at: "" }).success,
    ).toBe(true);
    expect(
      UpdateCaptureInputSchema.safeParse({ id: "c1", content: null, resurface_at: null }).success,
    ).toBe(true);
  });
});

// --- executor layer (mocked db) --------------------------------------------

// Capture what Drizzle receives inside the transaction.
const captured = {
  insertValues: null as Record<string, unknown> | null,
  updateSet: null as Record<string, unknown> | null,
};
const existingRow = {
  current: [] as Array<Record<string, unknown>>,
};

function makeTx() {
  return {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        captured.insertValues = v;
        const p = Promise.resolve([]) as Promise<unknown[]> & {
          onConflictDoNothing?: () => Promise<unknown[]>;
          returning?: () => Promise<unknown[]>;
        };
        p.onConflictDoNothing = () => Promise.resolve([]);
        p.returning = () => Promise.resolve([{ id: (v.id as string) ?? "cap-1" }]);
        return p;
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(existingRow.current) }),
      }),
    }),
    update: () => ({
      set: (s: Record<string, unknown>) => {
        captured.updateSet = s;
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([{ id: "cap-1", content: (s.content as string) ?? "orig" }]),
          }),
        };
      },
    }),
  };
}

vi.mock("@/lib/db", () => ({
  db: {
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(makeTx())),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/lib/captures/auto-tag", () => ({ scheduleAutoTagging: vi.fn() }));
vi.mock("@/lib/link-preview/schedule", () => ({ scheduleLinkPreviews: vi.fn() }));
vi.mock("@/app/actions/hashtags", () => ({ upsertHashtag: vi.fn() }));
vi.mock("@/app/actions/people", () => ({
  reconcilePersonReferencesForUser: vi.fn(),
  resolveOrCreatePersonForUser: vi.fn(),
}));
vi.mock("@/lib/db/queries/people", () => ({ getPeopleForUser: vi.fn() }));
vi.mock("@/lib/gcal/events", () => ({}));
vi.mock("@/lib/gcal/token", () => ({
  GcalTokenRevokedError: class extends Error {},
  GcalNotConnectedError: class extends Error {},
  getValidGcalToken: vi.fn(),
}));
vi.mock("@/lib/jarvis/validate-references", () => ({
  validateCalendarId: vi.fn(),
  // No project ids in these tests → resolveProjectIds returns { ids: [], rejected: [] }.
  validateProjectIds: vi.fn(async () => ({ ok: true, ids: [], rejected: [] })),
}));

import { createServerExecutor } from "@/lib/jarvis/executor";
import type { ExecutionContext } from "@hyperpolymath/jarvis-core";

const ctx: ExecutionContext = {
  userId: "user-1",
  userTimezone: "America/New_York",
  defaultCalendarId: null,
};

beforeEach(() => {
  captured.insertValues = null;
  captured.updateSet = null;
  existingRow.current = [];
});

describe("executor.createCapture — resurface_at", () => {
  it("persists resurfaceAt as a Date when provided", async () => {
    const iso = "2026-07-14T00:00:00-04:00";
    const executor = createServerExecutor();
    const result = await executor.createCapture({ content: "remind me", resurface_at: iso }, ctx);
    expect(result.ok).toBe(true);
    expect(captured.insertValues?.resurfaceAt).toBeInstanceOf(Date);
    expect((captured.insertValues?.resurfaceAt as Date).toISOString()).toBe(
      new Date(iso).toISOString(),
    );
    if (result.ok) {
      expect((result.receipt as { resurface_at: string | null }).resurface_at).toBe(iso);
    }
  });

  it("stores null when resurface_at is omitted", async () => {
    const executor = createServerExecutor();
    const result = await executor.createCapture({ content: "no reminder" }, ctx);
    expect(result.ok).toBe(true);
    expect(captured.insertValues?.resurfaceAt).toBeNull();
  });
});

describe("executor.updateCapture — resurface_at", () => {
  it("sets resurfaceAt from an ISO string", async () => {
    existingRow.current = [
      { id: "cap-1", content: "orig", url: null, urls: [], resurfaceAt: null },
    ];
    const iso = "2026-07-20T00:00:00-04:00";
    const executor = createServerExecutor();
    const result = await executor.updateCapture({ id: "cap-1", resurface_at: iso }, ctx);
    expect(result.ok).toBe(true);
    expect(captured.updateSet?.resurfaceAt).toBeInstanceOf(Date);
    expect((captured.updateSet?.resurfaceAt as Date).toISOString()).toBe(new Date(iso).toISOString());
  });

  it("clears resurfaceAt (null) when passed an empty string", async () => {
    existingRow.current = [
      {
        id: "cap-1",
        content: "orig",
        url: null,
        urls: [],
        resurfaceAt: new Date("2026-07-20T04:00:00Z"),
      },
    ];
    const executor = createServerExecutor();
    const result = await executor.updateCapture({ id: "cap-1", resurface_at: "" }, ctx);
    expect(result.ok).toBe(true);
    expect(captured.updateSet?.resurfaceAt).toBeNull();
  });

  it("leaves resurfaceAt untouched when resurface_at is null", async () => {
    existingRow.current = [
      { id: "cap-1", content: "orig", url: null, urls: [], resurfaceAt: null },
    ];
    const executor = createServerExecutor();
    const result = await executor.updateCapture({ id: "cap-1", resurface_at: null }, ctx);
    expect(result.ok).toBe(true);
    expect("resurfaceAt" in (captured.updateSet ?? {})).toBe(false);
  });
});
