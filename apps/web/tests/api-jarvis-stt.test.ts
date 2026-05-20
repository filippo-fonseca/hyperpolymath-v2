/**
 * POST /api/jarvis/stt — Groq Whisper STT proxy route.
 *
 * Phase 7 Plan 07-01 Task 2 (TDD RED phase).
 *
 * Verifies:
 *   1. Returns 200 + { transcript: string } on valid audio + auth.
 *      Groq mock called with model 'whisper-large-v3-turbo' and language 'en'.
 *   2. Returns 401 without auth (getClaims returns null claims).
 *   3. Returns 400 on empty body (zero-byte audio).
 *   4. Returns 500 on Groq failure — error message is "STT failed" (no leak).
 *   5. Returns 413 on body > 25MB (Pitfall 8 server-side belt).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (hoisted so vi.mock factories run before imports)
// ---------------------------------------------------------------------------

const createMock = vi.fn();

vi.mock("groq-sdk", () => ({
  default: class {
    audio = { transcriptions: { create: createMock } };
  },
}));

const getClaimsMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/jarvis/stt", () => {
  beforeEach(() => {
    createMock.mockReset();
    getClaimsMock.mockReset();
    // Authenticated by default
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
  });

  it("returns 200 + transcript on valid audio + auth", async () => {
    createMock.mockResolvedValue({ text: "buy milk" });

    const { POST } = await import("@/app/api/jarvis/stt/route");
    const body = new Uint8Array(1000); // 1KB dummy audio
    const res = await POST(
      new Request("http://localhost/api/jarvis/stt", {
        method: "POST",
        body,
        headers: { "Content-Type": "audio/wav" },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transcript: "buy milk" });

    // Assert Groq was called with the correct model and language
    expect(createMock).toHaveBeenCalledOnce();
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "whisper-large-v3-turbo",
        language: "en",
      }),
    );
  });

  it("returns 401 when getClaims returns null claims", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null } });

    const { POST } = await import("@/app/api/jarvis/stt/route");
    const body = new Uint8Array(1000);
    const res = await POST(
      new Request("http://localhost/api/jarvis/stt", {
        method: "POST",
        body,
        headers: { "Content-Type": "audio/wav" },
      }),
    );

    expect(res.status).toBe(401);
    // Groq should NOT have been called
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 400 on empty body (zero bytes)", async () => {
    const { POST } = await import("@/app/api/jarvis/stt/route");
    const res = await POST(
      new Request("http://localhost/api/jarvis/stt", {
        method: "POST",
        body: new Uint8Array(0),
        headers: { "Content-Type": "audio/wav" },
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty("error");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 500 on Groq failure and does NOT leak the original error", async () => {
    createMock.mockRejectedValue(new Error("Internal Groq error — API key invalid"));

    const { POST } = await import("@/app/api/jarvis/stt/route");
    const body = new Uint8Array(1000);
    const res = await POST(
      new Request("http://localhost/api/jarvis/stt", {
        method: "POST",
        body,
        headers: { "Content-Type": "audio/wav" },
      }),
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    // Error message must be generic — must NOT contain the original error string
    expect(json.error).toBe("STT failed");
    expect(JSON.stringify(json)).not.toContain("API key");
  });

  it("returns 413 on body > 25MB (Pitfall 8 guard)", async () => {
    const { POST } = await import("@/app/api/jarvis/stt/route");
    // 26MB body
    const body = new Uint8Array(26 * 1024 * 1024);
    const res = await POST(
      new Request("http://localhost/api/jarvis/stt", {
        method: "POST",
        body,
        headers: { "Content-Type": "audio/wav" },
      }),
    );

    expect(res.status).toBe(413);
    expect(createMock).not.toHaveBeenCalled();
  });
});
