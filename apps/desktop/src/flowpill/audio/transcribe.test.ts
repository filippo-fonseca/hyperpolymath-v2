import { describe, expect, it, vi } from "vitest";

import { tonePcm } from "./test-fixtures";
import { transcribeUtterance, type FetchLike } from "./transcribe";

// The real module reaches for Tauri's native fetch and the on-disk device
// token. Neither exists in a headless test process, and every test here injects
// its own, so the imports are stubbed at the module boundary.
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("@/auth/device-token", () => ({ getDeviceToken: async () => "hpd_test_token" }));

interface Recorded {
  url: string;
  init: { method: string; headers: Record<string, string>; body: Uint8Array };
}

function stubFetch(
  responses: Array<{ ok: boolean; status: number; json?: unknown; throws?: Error }>,
): { fetchImpl: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  let index = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(index++, responses.length - 1)];
    if (!next) throw new Error("no stubbed response");
    if (next.throws) throw next.throws;
    return {
      ok: next.ok,
      status: next.status,
      json: async () => next.json,
    };
  };
  return { fetchImpl, calls };
}

const deps = (fetchImpl: FetchLike) => ({
  fetchImpl,
  apiBaseUrl: "http://localhost:3000",
});

function readString(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i] ?? 0);
  return out;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function readU16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

describe("transcribeUtterance: the request", () => {
  it("posts WAV to the probe route with the side-effect-free header", async () => {
    const { fetchImpl, calls } = stubFetch([{ ok: true, status: 200, json: { transcript: "hi" } }]);
    await transcribeUtterance(tonePcm(1_600), 16_000, deps(fetchImpl));

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("http://localhost:3000/api/jarvis/voice/transcript");
    expect(call.init.method).toBe("POST");
    expect(call.init.headers["x-jarvis-probe"]).toBe("1");
    expect(call.init.headers["content-type"]).toBe("audio/wav");
  });

  it("mirrors the device bearer and legacy trigger secret from the api client", async () => {
    const { fetchImpl, calls } = stubFetch([{ ok: true, status: 200, json: { transcript: "hi" } }]);
    await transcribeUtterance(tonePcm(1_600), 16_000, { fetchImpl, apiBaseUrl: "http://x" });
    const headers = calls[0]!.init.headers;
    expect(headers["authorization"]).toBe("Bearer hpd_test_token");
    expect(headers).toHaveProperty("x-trigger-secret");
  });

  it("sends a well-formed 16 kHz mono 16-bit WAV", async () => {
    const { fetchImpl, calls } = stubFetch([{ ok: true, status: 200, json: { transcript: "hi" } }]);
    const samples = tonePcm(8_000);
    await transcribeUtterance(samples, 16_000, deps(fetchImpl));

    const body = calls[0]!.init.body;
    expect(readString(body, 0, 4)).toBe("RIFF");
    expect(readString(body, 8, 4)).toBe("WAVE");
    expect(readString(body, 12, 4)).toBe("fmt ");
    expect(readU16(body, 20)).toBe(1); // PCM
    expect(readU16(body, 22)).toBe(1); // mono
    expect(readU32(body, 24)).toBe(16_000); // sample rate
    expect(readU32(body, 28)).toBe(32_000); // byte rate = rate * blockAlign
    expect(readU16(body, 32)).toBe(2); // block align
    expect(readU16(body, 34)).toBe(16); // bits per sample
    expect(readString(body, 36, 4)).toBe("data");
    expect(readU32(body, 40)).toBe(samples.length * 2);
    expect(body.byteLength).toBe(44 + samples.length * 2);
  });
});

describe("transcribeUtterance: the outcome", () => {
  it("returns the trimmed transcript on success", async () => {
    const { fetchImpl } = stubFetch([
      { ok: true, status: 200, json: { transcript: "  add milk to the list  " } },
    ]);
    await expect(transcribeUtterance(tonePcm(1_600), 16_000, deps(fetchImpl))).resolves.toEqual({
      kind: "transcript",
      text: "add milk to the list",
    });
  });

  it("reports an empty transcript as empty, not as success", async () => {
    const { fetchImpl } = stubFetch([{ ok: true, status: 200, json: { transcript: "" } }]);
    await expect(transcribeUtterance(tonePcm(1_600), 16_000, deps(fetchImpl))).resolves.toEqual({
      kind: "empty",
    });
  });

  it("reports a whitespace-only transcript as empty", async () => {
    const { fetchImpl } = stubFetch([{ ok: true, status: 200, json: { transcript: "   \n\t " } }]);
    await expect(transcribeUtterance(tonePcm(1_600), 16_000, deps(fetchImpl))).resolves.toEqual({
      kind: "empty",
    });
  });

  it("reports a missing transcript field as empty", async () => {
    const { fetchImpl } = stubFetch([{ ok: true, status: 200, json: {} }]);
    await expect(transcribeUtterance(tonePcm(1_600), 16_000, deps(fetchImpl))).resolves.toEqual({
      kind: "empty",
    });
  });

  it("returns empty without a request when there is nothing to send", async () => {
    const { fetchImpl, calls } = stubFetch([{ ok: true, status: 200, json: { transcript: "x" } }]);
    await expect(transcribeUtterance(new Float32Array(0), 16_000, deps(fetchImpl))).resolves.toEqual(
      { kind: "empty" },
    );
    expect(calls).toHaveLength(0);
  });

  it("does not retry a 4xx", async () => {
    const { fetchImpl, calls } = stubFetch([{ ok: false, status: 401 }]);
    const result = await transcribeUtterance(tonePcm(1_600), 16_000, deps(fetchImpl));
    expect(result).toEqual({ kind: "failed", message: "transcript request 401", status: 401 });
    expect(calls).toHaveLength(1);
  });

  it("retries a 5xx exactly once and then gives up", async () => {
    const { fetchImpl, calls } = stubFetch([{ ok: false, status: 503 }]);
    const result = await transcribeUtterance(tonePcm(1_600), 16_000, deps(fetchImpl));
    expect(result).toEqual({ kind: "failed", message: "transcript request 503", status: 503 });
    expect(calls).toHaveLength(2);
  });

  it("recovers when the retry succeeds", async () => {
    const { fetchImpl, calls } = stubFetch([
      { ok: false, status: 500 },
      { ok: true, status: 200, json: { transcript: "second time lucky" } },
    ]);
    await expect(transcribeUtterance(tonePcm(1_600), 16_000, deps(fetchImpl))).resolves.toEqual({
      kind: "transcript",
      text: "second time lucky",
    });
    expect(calls).toHaveLength(2);
  });

  it("reports a transport failure without throwing, after one retry", async () => {
    const { fetchImpl, calls } = stubFetch([{ ok: false, status: 0, throws: new Error("offline") }]);
    const result = await transcribeUtterance(tonePcm(1_600), 16_000, deps(fetchImpl));
    expect(result).toEqual({ kind: "failed", message: "offline" });
    expect(calls).toHaveLength(2);
  });
});
