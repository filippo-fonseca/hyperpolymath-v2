import { describe, it, expect } from "vitest";
import { stripWakeWord } from "@/lib/voice/wake-word";

describe("stripWakeWord", () => {
  describe("returns command portion after wake phrase", () => {
    it.each([
      ["hey jarvis, buy milk", "buy milk"],
      ["Hey Jarvis buy milk", "buy milk"],
      ["jarvis what time is it", "what time is it"],
      ["okay jarvis schedule a meeting", "schedule a meeting"],
      ["ok jarvis remember mom's birthday", "remember mom's birthday"],
      ["hi jarvis. add bread to my list", "add bread to my list"],
      ["yo jarvis play music", "play music"],
      ["hello jarvis turn on the lights", "turn on the lights"],
    ])("%s → %s", (input, expected) => {
      expect(stripWakeWord(input)).toBe(expected);
    });
  });

  describe("returns empty string for wake phrase alone", () => {
    it.each(["hey jarvis", "Jarvis", "ok jarvis", "okay jarvis."])(
      "%s → ''",
      (input) => {
        expect(stripWakeWord(input)).toBe("");
      },
    );
  });

  describe("returns null when no wake phrase", () => {
    it.each([
      "buy milk",
      "what time is it",
      "remind me to call mom",
      "",
      "the cat sat on the mat",
      // jarvis must be at the start to count — not buried mid-sentence.
      "tell jarvis to buy milk",
    ])("%s → null", (input) => {
      expect(stripWakeWord(input)).toBeNull();
    });
  });

  describe("tolerates common Whisper mishears", () => {
    it.each([
      ["hey jervis buy milk", "buy milk"],
      ["javis what time", "what time"],
      ["hey jarvy add task", "add task"],
    ])("%s → %s", (input, expected) => {
      expect(stripWakeWord(input)).toBe(expected);
    });
  });
});
