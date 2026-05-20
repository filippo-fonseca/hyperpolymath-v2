import { describe, it, expect } from "vitest";
import { micReducer, type MicAction } from "@/lib/voice/mic-state";

describe("micReducer", () => {
  it("VOICE_ENABLED: idle → listening", () => {
    expect(micReducer("idle", { type: "VOICE_ENABLED" })).toBe("listening");
  });

  it("WAKE_WORD_DETECTED: listening → recording", () => {
    expect(micReducer("listening", { type: "WAKE_WORD_DETECTED" })).toBe("recording");
  });

  it("DOUBLE_CLAP: listening → recording (equivalent to wake-word)", () => {
    expect(micReducer("listening", { type: "DOUBLE_CLAP" })).toBe("recording");
  });

  it("SPEECH_END: recording → thinking", () => {
    expect(micReducer("recording", { type: "SPEECH_END" })).toBe("thinking");
  });

  it("TTS_START: thinking → speaking", () => {
    expect(micReducer("thinking", { type: "TTS_START" })).toBe("speaking");
  });

  it("TTS_END: speaking → listening", () => {
    expect(micReducer("speaking", { type: "TTS_END" })).toBe("listening");
  });

  it("VOICE_DISABLED from any state → idle", () => {
    for (const s of ["idle", "listening", "recording", "thinking", "speaking"] as const) {
      expect(micReducer(s, { type: "VOICE_DISABLED" })).toBe("idle");
    }
  });

  it("ERROR from non-idle → listening (resilient recovery)", () => {
    for (const s of ["listening", "recording", "thinking", "speaking"] as const) {
      expect(micReducer(s, { type: "ERROR" })).toBe("listening");
    }
  });

  it("SPEECH_START from speaking → recording (barge-in)", () => {
    expect(micReducer("speaking", { type: "SPEECH_START" })).toBe("recording");
  });

  it("Unknown action returns current state unchanged (default branch)", () => {
    // @ts-expect-error testing default branch
    expect(micReducer("listening", { type: "BOGUS" })).toBe("listening");
  });
});
