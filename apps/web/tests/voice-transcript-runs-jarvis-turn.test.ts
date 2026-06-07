/**
 * POST /api/jarvis/voice/transcript — server-side JARVIS turn tests.
 *
 * Verifies:
 *   1. On success, emits jarvis-response-start on physicalBus before returning 200.
 *   2. Response body includes { transcript, turnId }.
 *   3. Returns 409 when findSingleUserId returns null (multi-user state).
 *   4. Still emits transcript event on physicalBus even when JARVIS turn fires.
 *   5. Returns 401 without x-trigger-secret.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGroqCreate, mockFindSingleUserId, mockRunJarvisTurnStream } = vi.hoisted(() => ({
  mockGroqCreate: vi.fn().mockResolvedValue({ text: "create a task for Monday" }),
  mockFindSingleUserId: vi.fn().mockResolvedValue("user-id-123"),
  mockRunJarvisTurnStream: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("groq-sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: mockGroqCreate } },
  })),
}));

vi.mock("@/lib/jarvis/find-single-user", () => ({
  findSingleUserId: mockFindSingleUserId,
}));

vi.mock("@/lib/jarvis/run-turn", () => ({
  runJarvisTurnStream: mockRunJarvisTurnStream,
}));

import { physicalBus } from "@/lib/voice/physical-extension/bus";
import { POST } from "@/app/api/jarvis/voice/transcript/route";

describe("POST /api/jarvis/voice/transcript — server-side JARVIS turn", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let emitSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(() => {
    emitSpy = vi.spyOn(physicalBus, "emit");
    vi.stubEnv("PHYSICAL_TRIGGER_SECRET", "secret-123");
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    mockGroqCreate.mockResolvedValue({ text: "create a task for Monday" });
    mockFindSingleUserId.mockResolvedValue("user-id-123");
    mockRunJarvisTurnStream.mockResolvedValue(undefined);
  });

  afterEach(() => {
    emitSpy.mockRestore();
    vi.unstubAllEnvs();
    mockGroqCreate.mockReset();
    mockGroqCreate.mockResolvedValue({ text: "create a task for Monday" });
    mockFindSingleUserId.mockReset();
    mockRunJarvisTurnStream.mockReset();
  });

  it("returns 401 without x-trigger-secret", async () => {
    const req = new Request("http://localhost/api/jarvis/voice/transcript", {
      method: "POST",
      body: new Uint8Array(100).fill(1).buffer,
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
    expect(mockRunJarvisTurnStream).not.toHaveBeenCalled();
  });

  it("returns 200, emits transcript event, includes turnId in response", async () => {
    const audioData = new Uint8Array(1000).fill(1);
    const req = new Request("http://localhost/api/jarvis/voice/transcript", {
      method: "POST",
      headers: { "x-trigger-secret": "secret-123" },
      body: audioData.buffer,
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.transcript).toBe("create a task for Monday");
    expect(typeof body.turnId).toBe("string");
    expect(body.turnId.length).toBeGreaterThan(0);

    expect(emitSpy).toHaveBeenCalledWith(
      "transcript",
      expect.objectContaining({ transcript: "create a task for Monday" }),
    );
  });

  it("emits jarvis-response-start on physicalBus after successful transcription", async () => {
    const audioData = new Uint8Array(1000).fill(1);
    const req = new Request("http://localhost/api/jarvis/voice/transcript", {
      method: "POST",
      headers: { "x-trigger-secret": "secret-123" },
      body: audioData.buffer,
    });
    await POST(req as unknown as import("next/server").NextRequest);

    expect(emitSpy).toHaveBeenCalledWith(
      "jarvis-response-start",
      expect.objectContaining({ turnId: expect.any(String), at: expect.any(Number) }),
    );
  });

  it("calls runJarvisTurnStream with the transcribed text and userId", async () => {
    const audioData = new Uint8Array(1000).fill(2);
    const req = new Request("http://localhost/api/jarvis/voice/transcript", {
      method: "POST",
      headers: { "x-trigger-secret": "secret-123" },
      body: audioData.buffer,
    });
    await POST(req as unknown as import("next/server").NextRequest);

    expect(mockRunJarvisTurnStream).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-id-123",
        input: "create a task for Monday",
        isVoice: true,
      }),
    );
  });

  it("returns 409 when findSingleUserId returns null", async () => {
    mockFindSingleUserId.mockResolvedValue(null);
    const audioData = new Uint8Array(1000).fill(3);
    const req = new Request("http://localhost/api/jarvis/voice/transcript", {
      method: "POST",
      headers: { "x-trigger-secret": "secret-123" },
      body: audioData.buffer,
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("single-user");
    expect(mockRunJarvisTurnStream).not.toHaveBeenCalled();
  });

  it("still emits transcript SSE event even when JARVIS turn fires", async () => {
    const audioData = new Uint8Array(1000).fill(4);
    const req = new Request("http://localhost/api/jarvis/voice/transcript", {
      method: "POST",
      headers: { "x-trigger-secret": "secret-123" },
      body: audioData.buffer,
    });
    await POST(req as unknown as import("next/server").NextRequest);

    const transcriptCalls = emitSpy.mock.calls.filter((c) => c[0] === "transcript");
    expect(transcriptCalls.length).toBeGreaterThan(0);
    expect(mockRunJarvisTurnStream).toHaveBeenCalled();
  });
});
