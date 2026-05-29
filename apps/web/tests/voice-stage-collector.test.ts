/**
 * voice-stage-collector — Phase 9 / TEL-01 module-level batching collector.
 *
 * Covers behaviors 8-10 from the plan:
 *   - 3-stage flush via navigator.sendBeacon when all 3 are collected
 *   - sendBeacon=false → fetch fallback with keepalive:true
 *   - navigator.sendBeacon undefined → fetch fallback
 *   - turn rotation: setActiveTurnId('A')→1 stage→setActiveTurnId('B') partial-flushes A
 *   - collectStage with no activeTurnId is a no-op
 *   - flushNow is idempotent
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForTests,
  collectStage,
  flushNow,
  setActiveTurnId,
} from "@/lib/voice/voice-stage-collector";

const sendBeaconMock = vi.fn();
const fetchMock = vi.fn();

beforeEach(() => {
  __resetForTests();
  sendBeaconMock.mockReset().mockReturnValue(true);
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("navigator", { sendBeacon: sendBeaconMock });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Cross-runtime Blob → string helper. jsdom's Blob historically lacks
 *  .text() and .arrayBuffer() (or returns "[object Blob]" via toString).
 *  FileReader provides reliable Blob → string in jsdom; node-style fallback
 *  via Response(blob).text() works in real Node 20+. */
async function readBlobText(blob: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
  }
  if (typeof blob.text === "function") {
    try {
      return await blob.text();
    } catch {
      /* fall through */
    }
  }
  return new Response(blob).text();
}

describe("voice-stage-collector — happy path", () => {
  it("flushes a single beacon after all 3 stages collected", async () => {
    setActiveTurnId("91cd3407-fa17-4f9d-898d-54b3c5638827");
    collectStage("vad_end_at", new Date(1700000001000));
    collectStage("tts_first_byte_at", new Date(1700000002000));
    expect(sendBeaconMock).not.toHaveBeenCalled();
    collectStage("audio_first_play_at", new Date(1700000003000));
    expect(sendBeaconMock).toHaveBeenCalledTimes(1);

    // Inspect URL + body shape
    const [url, blob] = sendBeaconMock.mock.calls[0] as [string, Blob];
    expect(url).toBe("/api/jarvis/telemetry/voice-stages");
    const payload = JSON.parse(await readBlobText(blob)) as Record<string, unknown>;
    expect(payload).toEqual({
      turnId: "91cd3407-fa17-4f9d-898d-54b3c5638827",
      vadEndAtMs: 1700000001000,
      ttsFirstByteAtMs: 1700000002000,
      audioFirstPlayAtMs: 1700000003000,
    });
  });

  it("does not re-flush after the 3-stage flush even if a duplicate collectStage fires", () => {
    setActiveTurnId("91cd3407-fa17-4f9d-898d-54b3c5638827");
    collectStage("vad_end_at", new Date(1700000001000));
    collectStage("tts_first_byte_at", new Date(1700000002000));
    collectStage("audio_first_play_at", new Date(1700000003000));
    expect(sendBeaconMock).toHaveBeenCalledTimes(1);

    // Duplicate audio_first_play_at shouldn't flush again (state was reset)
    collectStage("audio_first_play_at", new Date(1700000004000));
    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
  });
});

describe("voice-stage-collector — turn rotation", () => {
  it("partial-flushes the previous turn when setActiveTurnId rotates", () => {
    setActiveTurnId("91cd3407-fa17-4f9d-898d-54b3c5638827");
    collectStage("vad_end_at", new Date(1700000001000));
    // Rotate without completing all 3 stages
    setActiveTurnId("a2f4b6c8-1d3e-4a5b-9c7d-8e9f0a1b2c3d");
    expect(sendBeaconMock).toHaveBeenCalledTimes(1); // partial flush of turn A
  });

  it("does not partial-flush previous turn when no stages were collected", () => {
    setActiveTurnId("91cd3407-fa17-4f9d-898d-54b3c5638827");
    // No collectStage calls before rotation
    setActiveTurnId("a2f4b6c8-1d3e-4a5b-9c7d-8e9f0a1b2c3d");
    expect(sendBeaconMock).not.toHaveBeenCalled();
  });
});

describe("voice-stage-collector — beacon fallback", () => {
  it("falls back to fetch keepalive when sendBeacon returns false", () => {
    sendBeaconMock.mockReturnValue(false);
    setActiveTurnId("91cd3407-fa17-4f9d-898d-54b3c5638827");
    collectStage("vad_end_at", new Date(1700000001000));
    collectStage("tts_first_byte_at", new Date(1700000002000));
    collectStage("audio_first_play_at", new Date(1700000003000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/jarvis/telemetry/voice-stages");
    expect((init as { keepalive?: boolean }).keepalive).toBe(true);
    expect(init.method).toBe("POST");
  });

  it("falls back to fetch when navigator.sendBeacon is undefined", () => {
    vi.stubGlobal("navigator", {}); // no sendBeacon
    setActiveTurnId("91cd3407-fa17-4f9d-898d-54b3c5638827");
    collectStage("vad_end_at", new Date(1700000001000));
    collectStage("tts_first_byte_at", new Date(1700000002000));
    collectStage("audio_first_play_at", new Date(1700000003000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to fetch when sendBeacon throws", () => {
    sendBeaconMock.mockImplementation(() => {
      throw new Error("sendBeacon failed");
    });
    setActiveTurnId("91cd3407-fa17-4f9d-898d-54b3c5638827");
    collectStage("vad_end_at", new Date(1700000001000));
    collectStage("tts_first_byte_at", new Date(1700000002000));
    collectStage("audio_first_play_at", new Date(1700000003000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("voice-stage-collector — defensive no-op", () => {
  it("collectStage with no activeTurnId is a no-op", () => {
    collectStage("vad_end_at", new Date(1700000001000));
    expect(sendBeaconMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flushNow with no pending state is idempotent / harmless", () => {
    flushNow();
    flushNow();
    expect(sendBeaconMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flushNow flushes a partial-stage turn (e.g. only vad_end_at collected)", () => {
    setActiveTurnId("91cd3407-fa17-4f9d-898d-54b3c5638827");
    collectStage("vad_end_at", new Date(1700000001000));
    flushNow();
    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
  });

  it("flushNow is idempotent (second call after flush is a no-op)", () => {
    setActiveTurnId("91cd3407-fa17-4f9d-898d-54b3c5638827");
    collectStage("vad_end_at", new Date(1700000001000));
    flushNow();
    flushNow();
    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
  });
});
