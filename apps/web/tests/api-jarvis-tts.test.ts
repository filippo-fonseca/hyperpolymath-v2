/**
 * POST /api/jarvis/tts — ElevenLabs Flash TTS streaming proxy route.
 *
 * Phase 7 Plan 07-01 Task 3 (TDD RED phase).
 *
 * Verifies:
 *   1. Returns 200 + Content-Type: audio/mpeg on valid request with default voiceId.
 *      ElevenLabs mock called with model_id 'eleven_flash_v2_5' and DEFAULT_VOICE_ID.
 *   2. Explicit voiceId in body overrides DEFAULT_VOICE_ID.
 *   3. Returns 401 without auth.
 *   4. Returns 400 when text is empty/missing.
 *   5. Returns 413 when text.length > 5000.
 *   6. Returns 502 on ElevenLabs upstream failure (NOT 500 — upstream-failed signal per Pitfall 7).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const convertMock = vi.fn();

vi.mock("elevenlabs", () => ({
  ElevenLabsClient: vi.fn(() => ({
    textToSpeech: { convertAsStream: convertMock },
  })),
}));

const getClaimsMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an async generator that yields a single chunk */
function makeAudioStream(chunk = new Uint8Array([1, 2, 3])) {
  return (async function* () {
    yield chunk;
  })();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/jarvis/tts", () => {
  beforeEach(() => {
    convertMock.mockReset();
    getClaimsMock.mockReset();
    // Authenticated by default
    getClaimsMock.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    // Default: convert returns a valid async iterable
    convertMock.mockResolvedValue(makeAudioStream());
  });

  it("returns 200 + audio/mpeg using DEFAULT_VOICE_ID when voiceId omitted", async () => {
    const { POST } = await import("@/app/api/jarvis/tts/route");
    const res = await POST(
      new Request("http://localhost/api/jarvis/tts", {
        method: "POST",
        body: JSON.stringify({ text: "Task filed, sir." }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");

    // Default voice ID (George) used when voiceId not provided
    expect(convertMock).toHaveBeenCalledOnce();
    expect(convertMock).toHaveBeenCalledWith(
      "JBFqnCBsd6RMkjVDRZzb",
      expect.objectContaining({ model_id: "eleven_flash_v2_5" }),
    );
  });

  it("uses explicit voiceId from body instead of default", async () => {
    const { POST } = await import("@/app/api/jarvis/tts/route");
    const res = await POST(
      new Request("http://localhost/api/jarvis/tts", {
        method: "POST",
        body: JSON.stringify({ text: "Noted.", voiceId: "custom-voice-xyz" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(res.status).toBe(200);
    expect(convertMock).toHaveBeenCalledWith(
      "custom-voice-xyz",
      expect.anything(),
    );
  });

  it("returns 401 when getClaims returns null claims", async () => {
    getClaimsMock.mockResolvedValue({ data: { claims: null } });

    const { POST } = await import("@/app/api/jarvis/tts/route");
    const res = await POST(
      new Request("http://localhost/api/jarvis/tts", {
        method: "POST",
        body: JSON.stringify({ text: "hello" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(res.status).toBe(401);
    expect(convertMock).not.toHaveBeenCalled();
  });

  it("returns 400 when text is empty", async () => {
    const { POST } = await import("@/app/api/jarvis/tts/route");
    const res = await POST(
      new Request("http://localhost/api/jarvis/tts", {
        method: "POST",
        body: JSON.stringify({ text: "   " }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toHaveProperty("error");
    expect(convertMock).not.toHaveBeenCalled();
  });

  it("returns 413 when text.length > 5000 chars", async () => {
    const { POST } = await import("@/app/api/jarvis/tts/route");
    const res = await POST(
      new Request("http://localhost/api/jarvis/tts", {
        method: "POST",
        body: JSON.stringify({ text: "a".repeat(5001) }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(res.status).toBe(413);
    expect(convertMock).not.toHaveBeenCalled();
  });

  it("returns 502 on ElevenLabs upstream failure (Pitfall 7 — upstream-failed signal)", async () => {
    convertMock.mockRejectedValue(new Error("ElevenLabs 429 rate limit exceeded"));

    const { POST } = await import("@/app/api/jarvis/tts/route");
    const res = await POST(
      new Request("http://localhost/api/jarvis/tts", {
        method: "POST",
        body: JSON.stringify({ text: "Filed." }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    // 502, NOT 500 — signals to client "upstream failed, use fallback"
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json).toHaveProperty("error");
  });
});
