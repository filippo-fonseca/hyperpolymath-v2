/**
 * Phase 12 / WAKE-02 — AudioWorklet frame cadence.
 *
 * Wave 0 (TDD RED): wake-word-tap.js worklet does not yet exist. Task 3
 * lands it and brings this suite GREEN.
 *
 * Contract under test: given a 48 kHz mono input of 48000 samples (1 sec),
 * the worklet emits exactly 12 frames of length 1280 each (12.5 frames/sec
 * at 16 kHz × 80 ms; the 0.5 partial frame stays buffered). Each emit
 * uses transferable Float32Array (verified by inspecting the second arg
 * of postMessage).
 *
 * Strategy: AudioWorkletProcessor runs in a separate global scope, so we
 * simulate its sandbox: stub `registerProcessor`, `sampleRate`, and
 * `AudioWorkletProcessor`, then load the source file into the current
 * scope and instantiate the captured class directly.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// biome-ignore lint/suspicious/noExplicitAny: deliberate AudioWorklet sandbox shim
function loadWorklet(): any {
  let captured: any = null;
  const sandbox = {
    sampleRate: 48000,
    AudioWorkletProcessor: class {
      port: { postMessage: ReturnType<typeof vi.fn> };
      constructor() {
        this.port = { postMessage: vi.fn() };
      }
    },
    registerProcessor: (_name: string, ctor: any) => {
      captured = ctor;
    },
  };
  const source = readFileSync(
    resolve(import.meta.dirname, "..", "public", "worklets", "wake-word-tap.js"),
    "utf8",
  );
  // Wrap source so sampleRate / AudioWorkletProcessor / registerProcessor resolve
  // from the sandbox.
  const fn = new Function(
    "sampleRate",
    "AudioWorkletProcessor",
    "registerProcessor",
    source,
  );
  fn(sandbox.sampleRate, sandbox.AudioWorkletProcessor, sandbox.registerProcessor);
  if (!captured) throw new Error("worklet did not call registerProcessor");
  return new captured();
}

describe("WAKE-02 frame cadence", () => {
  it("emits exactly 12 frames of length 1280 given 48000 samples @ 48 kHz", () => {
    const proc = loadWorklet();
    const input = new Float32Array(48000);
    for (let i = 0; i < input.length; i++) input[i] = Math.sin(i / 100);
    proc.process([[input]], [], {});

    const calls = proc.port.postMessage.mock.calls;
    const frameMessages = calls.filter((c: unknown[]) => {
      const msg = c[0] as { type?: string };
      return msg?.type === "frame";
    });
    expect(frameMessages.length).toBe(12);
    for (const call of frameMessages) {
      const msg = call[0] as { type: string; pcm: Float32Array };
      expect(msg.pcm).toBeInstanceOf(Float32Array);
      expect(msg.pcm.length).toBe(1280);
    }
  });

  it("passes the frame's ArrayBuffer as transferable", () => {
    const proc = loadWorklet();
    const input = new Float32Array(48000);
    proc.process([[input]], [], {});

    const frameCalls = proc.port.postMessage.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type?: string })?.type === "frame",
    );
    expect(frameCalls.length).toBeGreaterThan(0);
    for (const call of frameCalls) {
      // postMessage(message, transferables)
      const transferables = call[1] as ArrayBuffer[] | undefined;
      expect(Array.isArray(transferables)).toBe(true);
      expect(transferables?.length).toBe(1);
      expect(transferables?.[0]).toBeInstanceOf(ArrayBuffer);
    }
  });

  it("handles a no-input frame gracefully (returns true, emits nothing)", () => {
    const proc = loadWorklet();
    const result = proc.process([[]], [], {});
    expect(result).toBe(true);
    const frameCalls = proc.port.postMessage.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type?: string })?.type === "frame",
    );
    expect(frameCalls.length).toBe(0);
  });
});
