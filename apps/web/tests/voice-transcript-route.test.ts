import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate, mockFindSingleUserId, mockRunTurnStream } = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue({ text: "hello world" }),
  mockFindSingleUserId: vi.fn().mockResolvedValue("user-id-abc"),
  mockRunTurnStream: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("groq-sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: mockCreate,
      },
    },
  })),
}));

vi.mock("@/lib/jarvis/find-single-user", () => ({
  findSingleUserId: mockFindSingleUserId,
}));

vi.mock("@/lib/jarvis/run-turn", () => ({
  runJarvisTurnStream: mockRunTurnStream,
}));

import { physicalBus } from "@/lib/voice/physical-extension/bus";
import { POST } from "@/app/api/jarvis/voice/transcript/route";

describe("POST /api/jarvis/voice/transcript", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let emitSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(() => {
    emitSpy = vi.spyOn(physicalBus, "emit");
    vi.stubEnv("PHYSICAL_TRIGGER_SECRET", "test-secret");
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
    mockCreate.mockResolvedValue({ text: "hello world" });
    mockFindSingleUserId.mockResolvedValue("user-id-abc");
    mockRunTurnStream.mockResolvedValue(undefined);
  });

  afterEach(() => {
    emitSpy.mockRestore();
    vi.unstubAllEnvs();
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ text: "hello world" });
    mockFindSingleUserId.mockReset();
    mockRunTurnStream.mockReset();
  });

  it("returns 401 without x-trigger-secret and does not emit", async () => {
    const body = new ArrayBuffer(100);
    const req = new Request("http://localhost/api/jarvis/voice/transcript", {
      method: "POST",
      body,
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
    expect(emitSpy).not.toHaveBeenCalledWith("transcript", expect.anything());
  });

  it("returns 400 with empty body", async () => {
    const req = new Request("http://localhost/api/jarvis/voice/transcript", {
      method: "POST",
      headers: { "x-trigger-secret": "test-secret" },
      body: new ArrayBuffer(0),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
    expect(emitSpy).not.toHaveBeenCalledWith("transcript", expect.anything());
  });

  it("returns 200 with transcript and turnId; emits transcript on physicalBus on success", async () => {
    const audioData = new Uint8Array(1000).fill(1);
    const req = new Request("http://localhost/api/jarvis/voice/transcript", {
      method: "POST",
      headers: { "x-trigger-secret": "test-secret" },
      body: audioData.buffer,
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transcript).toBe("hello world");
    expect(typeof body.turnId).toBe("string");
    expect(emitSpy).toHaveBeenCalledWith(
      "transcript",
      expect.objectContaining({
        transcript: "hello world",
        sttDoneAt: expect.any(Number),
        at: expect.any(Number),
      }),
    );
  });

  it("returns 500 and does not emit when Groq throws", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Groq exploded"));

    const audioData = new Uint8Array(1000).fill(2);
    const req = new Request("http://localhost/api/jarvis/voice/transcript", {
      method: "POST",
      headers: { "x-trigger-secret": "test-secret" },
      body: audioData.buffer,
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("STT failed");
    expect(emitSpy).not.toHaveBeenCalledWith("transcript", expect.anything());
  });
});
