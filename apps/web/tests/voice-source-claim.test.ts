import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  _resetVoiceSourceForTests,
  claimVoiceSource,
  getVoiceSourceStatus,
  SOURCE_CLAIM_TTL_MS,
} from "@/lib/voice/source-claim";

import { POST } from "@/app/api/jarvis/voice/source/claim/route";

describe("source-claim module", () => {
  beforeEach(() => {
    _resetVoiceSourceForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    _resetVoiceSourceForTests();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("initial state returns claimed: false, expiresIn: 0", () => {
    const status = getVoiceSourceStatus();
    expect(status.claimed).toBe(false);
    expect(status.expiresIn).toBe(0);
  });

  it("after claimVoiceSource(), returns claimed: true with expiresIn <= 30000", () => {
    claimVoiceSource();
    const status = getVoiceSourceStatus();
    expect(status.claimed).toBe(true);
    expect(status.expiresIn).toBeGreaterThan(0);
    expect(status.expiresIn).toBeLessThanOrEqual(SOURCE_CLAIM_TTL_MS);
  });

  it("after TTL expires (30001ms), returns claimed: false", () => {
    claimVoiceSource();
    vi.advanceTimersByTime(30_001);
    const status = getVoiceSourceStatus();
    expect(status.claimed).toBe(false);
    expect(status.expiresIn).toBe(0);
  });

  it("_resetVoiceSourceForTests() restores initial state", () => {
    claimVoiceSource();
    expect(getVoiceSourceStatus().claimed).toBe(true);
    _resetVoiceSourceForTests();
    expect(getVoiceSourceStatus().claimed).toBe(false);
  });

  describe("POST /api/jarvis/voice/source/claim", () => {
    it("valid x-trigger-secret returns 200 with { ok: true, ttlMs: 30000 } and claims source", async () => {
      vi.stubEnv("PHYSICAL_TRIGGER_SECRET", "test-secret");
      const req = new Request("http://localhost/api/jarvis/voice/source/claim", {
        method: "POST",
        headers: { "x-trigger-secret": "test-secret" },
      });
      const res = await POST(req as unknown as import("next/server").NextRequest);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.ttlMs).toBe(30_000);
      expect(getVoiceSourceStatus().claimed).toBe(true);
    });

    it("missing x-trigger-secret returns 401 and does NOT update claim", async () => {
      vi.stubEnv("PHYSICAL_TRIGGER_SECRET", "test-secret");
      _resetVoiceSourceForTests();
      const req = new Request("http://localhost/api/jarvis/voice/source/claim", {
        method: "POST",
      });
      const res = await POST(req as unknown as import("next/server").NextRequest);
      expect(res.status).toBe(401);
      expect(getVoiceSourceStatus().claimed).toBe(false);
    });

    it("wrong x-trigger-secret returns 401 and does NOT update claim", async () => {
      vi.stubEnv("PHYSICAL_TRIGGER_SECRET", "test-secret");
      _resetVoiceSourceForTests();
      const req = new Request("http://localhost/api/jarvis/voice/source/claim", {
        method: "POST",
        headers: { "x-trigger-secret": "wrong-secret" },
      });
      const res = await POST(req as unknown as import("next/server").NextRequest);
      expect(res.status).toBe(401);
      expect(getVoiceSourceStatus().claimed).toBe(false);
    });

    it("missing PHYSICAL_TRIGGER_SECRET env returns 500", async () => {
      vi.stubEnv("PHYSICAL_TRIGGER_SECRET", "");
      const req = new Request("http://localhost/api/jarvis/voice/source/claim", {
        method: "POST",
        headers: { "x-trigger-secret": "any-secret" },
      });
      const res = await POST(req as unknown as import("next/server").NextRequest);
      expect(res.status).toBe(500);
    });
  });
});
