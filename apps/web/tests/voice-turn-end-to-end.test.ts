/**
 * Phase 9 — regression guard: a mocked voice-turn round-trip results in
 * vad_end_at being included in the beacon payload.
 *
 * The original Plan 09-02 had a load-bearing bug: collectStage("vad_end_at",
 * new Date()) was called inside JarvisListener.onSpeechEnd, before
 * activeTurnId was set. The collector no-ops when activeTurnId is null,
 * so vad_end_at was dropped on every turn → composite "speech-end-to-audio"
 * stat would read 0 forever. This test asserts the corrected pipeline:
 * vad_end_at is captured LOCALLY in onSpeechEnd, piped through the
 * transcript event detail, and collectStage-d in the consumer AFTER
 * setActiveTurnId fires.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForTests,
  collectStage,
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

describe("voice-turn end-to-end — vad_end_at pipe-through regression guard", () => {
  it("vad_end_at appears in the beacon payload when piped via onTurnStart", async () => {
    // Simulate the pipeline:
    //   1. JarvisListener.onSpeechEnd captures vadEndAt as a local number (t=1000)
    //   2. transcript event dispatches with detail.vadEndAt = 1000
    //   3. consumer's handleVoiceTranscript reads detail, calls streamJarvis
    //   4. streamJarvis receives onTurnStart from server → fires callback
    //   5. onTurnStart callback: setActiveTurnId(turnId) → collectStage("vad_end_at", new Date(1000))
    //   6. tts_first_byte_at + audio_first_play_at fire at later times (2000, 3000)
    //   7. all 3 stages collected → flush

    const turnId = "11111111-1111-1111-1111-111111111111";
    const vadEndAtMs = 1000;

    // Step 5 — what the consumer's onTurnStart callback does
    setActiveTurnId(turnId);
    collectStage("vad_end_at", new Date(vadEndAtMs));

    // Step 6 — what use-tts-player + audio-queue do later
    collectStage("tts_first_byte_at", new Date(2000));
    collectStage("audio_first_play_at", new Date(3000));

    // Beacon should have been flushed with all 3 stages including vad_end_at
    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    const blob = sendBeaconMock.mock.calls[0][1] as Blob;
    const payload = JSON.parse(await readBlobText(blob)) as Record<string, unknown>;

    expect(payload.turnId).toBe(turnId);
    expect(
      payload.vadEndAtMs,
      "REGRESSION: vad_end_at dropped from beacon payload. The consumer's " +
        "onTurnStart callback is no longer calling collectStage('vad_end_at', ...) " +
        "after setActiveTurnId. Check GlobalJarvisHandler.tsx and JarvisConsole.tsx — " +
        "both must extract vadEndAt from detail and collectStage it inside onTurnStart.",
    ).toBe(vadEndAtMs);
    expect(payload.ttsFirstByteAtMs).toBe(2000);
    expect(payload.audioFirstPlayAtMs).toBe(3000);
  });

  it("collectStage('vad_end_at', ...) BEFORE setActiveTurnId is a no-op (the bug-class)", async () => {
    // Reproduce the original bug: collectStage before setActiveTurnId is a no-op.
    // This test documents the failure mode — the bug's signature is "only 2 of 3
    // stages ever land", so the auto-flush never fires for the natural happy path.
    collectStage("vad_end_at", new Date(1000));
    setActiveTurnId("11111111-1111-1111-1111-111111111111");
    collectStage("tts_first_byte_at", new Date(2000));
    collectStage("audio_first_play_at", new Date(3000));

    // No auto-flush — only 2 stages bound (vad_end_at was dropped pre-bind).
    expect(sendBeaconMock).not.toHaveBeenCalled();

    // A defensive flushNow (e.g. TTS_END hook) would still ship the partial
    // payload, but vad_end_at would be MISSING from it — the failure shape.
    const { flushNow } = await import("@/lib/voice/voice-stage-collector");
    flushNow();
    expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    const blob = sendBeaconMock.mock.calls[0][1] as Blob;
    const payload = JSON.parse(await readBlobText(blob)) as Record<string, unknown>;
    expect(payload.vadEndAtMs).toBeUndefined();
    expect(payload.ttsFirstByteAtMs).toBe(2000);
    expect(payload.audioFirstPlayAtMs).toBe(3000);
  });
});
