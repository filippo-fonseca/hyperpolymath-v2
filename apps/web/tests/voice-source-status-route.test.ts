import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetVoiceSourceForTests,
  claimVoiceSource,
} from "@/lib/voice/source-claim";
import { GET } from "@/app/api/jarvis/voice/source/status/route";

describe("GET /api/jarvis/voice/source/status", () => {
  beforeEach(() => {
    _resetVoiceSourceForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    _resetVoiceSourceForTests();
    vi.useRealTimers();
  });

  it("returns 200 with desktopClaimed: false and expiresAt: null when unclaimed", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { desktopClaimed: boolean; expiresAt: number | null };
    expect(body.desktopClaimed).toBe(false);
    expect(body.expiresAt).toBeNull();
  });

  it("returns desktopClaimed: true and numeric expiresAt after a fresh claim", async () => {
    claimVoiceSource();
    const now = Date.now();
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { desktopClaimed: boolean; expiresAt: number | null };
    expect(body.desktopClaimed).toBe(true);
    expect(body.expiresAt).not.toBeNull();
    // expiresAt should be in the future (within the 30 s TTL window)
    expect(body.expiresAt).toBeGreaterThan(now);
    expect(body.expiresAt).toBeLessThanOrEqual(now + 30_000);
  });

  it("returns desktopClaimed: false once the TTL lapses", async () => {
    claimVoiceSource();
    vi.advanceTimersByTime(30_001);
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { desktopClaimed: boolean; expiresAt: number | null };
    expect(body.desktopClaimed).toBe(false);
    expect(body.expiresAt).toBeNull();
  });

  it("reflects claim state changes across successive calls", async () => {
    // Unclaimed initially.
    const r1 = GET();
    const b1 = await r1.json() as { desktopClaimed: boolean };
    expect(b1.desktopClaimed).toBe(false);

    // Claim.
    claimVoiceSource();
    const r2 = GET();
    const b2 = await r2.json() as { desktopClaimed: boolean };
    expect(b2.desktopClaimed).toBe(true);

    // Reset (simulates desktop quit + TTL expiry).
    _resetVoiceSourceForTests();
    const r3 = GET();
    const b3 = await r3.json() as { desktopClaimed: boolean };
    expect(b3.desktopClaimed).toBe(false);
  });
});
