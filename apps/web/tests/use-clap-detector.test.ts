import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useClapDetector } from "@/lib/voice/use-clap-detector";

// Mock the constants so tests don't depend on specific file paths
vi.mock("@/lib/voice/constants", () => ({
  CLAP_WORKLET_URL: "/worklets/clap-detector.js",
  CLAP_PROCESSOR_NAME: "clap-detector-processor",
}));

function makeMockAudioContext() {
  const messageHandlers: Array<(e: MessageEvent) => void> = [];
  const fakeWorkletNode = {
    port: {
      set onmessage(fn: (e: MessageEvent) => void) {
        messageHandlers.push(fn);
      },
    },
    disconnect: vi.fn(),
  };
  const fakeSourceNode = { connect: vi.fn(), disconnect: vi.fn() };
  const addModule = vi.fn().mockResolvedValue(undefined);
  const ctx = {
    audioWorklet: { addModule },
    createMediaStreamSource: vi.fn().mockReturnValue(fakeSourceNode),
  } as unknown as AudioContext;

  // Patch AudioWorkletNode constructor globally
  (globalThis as any).AudioWorkletNode = vi
    .fn()
    .mockImplementation(() => fakeWorkletNode);

  return {
    ctx,
    fakeWorkletNode,
    fakeSourceNode,
    addModule,
    fireMessage: (data: unknown) =>
      messageHandlers.forEach((h) => h({ data } as MessageEvent)),
  };
}

describe("useClapDetector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when enabled=false — addModule not called", () => {
    const { ctx, addModule } = makeMockAudioContext();
    renderHook(() =>
      useClapDetector({
        enabled: false,
        audioContext: ctx,
        stream: {} as MediaStream,
        onDoubleClap: vi.fn(),
      }),
    );
    expect(addModule).not.toHaveBeenCalled();
  });

  it("does nothing when audioContext is null", () => {
    const { addModule } = makeMockAudioContext();
    renderHook(() =>
      useClapDetector({
        enabled: true,
        audioContext: null,
        stream: {} as MediaStream,
        onDoubleClap: vi.fn(),
      }),
    );
    expect(addModule).not.toHaveBeenCalled();
  });

  it("does nothing when stream is null", () => {
    const { ctx, addModule } = makeMockAudioContext();
    renderHook(() =>
      useClapDetector({
        enabled: true,
        audioContext: ctx,
        stream: null,
        onDoubleClap: vi.fn(),
      }),
    );
    expect(addModule).not.toHaveBeenCalled();
  });

  it("calls addModule with CLAP_WORKLET_URL when enabled + context + stream are all valid", async () => {
    const { ctx, addModule } = makeMockAudioContext();
    renderHook(() =>
      useClapDetector({
        enabled: true,
        audioContext: ctx,
        stream: {} as MediaStream,
        onDoubleClap: vi.fn(),
      }),
    );
    // Allow async addModule call to resolve
    await new Promise((r) => setTimeout(r, 20));
    expect(addModule).toHaveBeenCalledOnce();
    expect(addModule).toHaveBeenCalledWith("/worklets/clap-detector.js");
  });

  it("calls onDoubleClap when worklet posts { type: 'double-clap' } message", async () => {
    const { ctx, fireMessage } = makeMockAudioContext();
    const onClap = vi.fn();
    renderHook(() =>
      useClapDetector({
        enabled: true,
        audioContext: ctx,
        stream: {} as MediaStream,
        onDoubleClap: onClap,
      }),
    );
    // Wait for async addModule + handler setup
    await new Promise((r) => setTimeout(r, 20));
    fireMessage({ type: "double-clap" });
    expect(onClap).toHaveBeenCalledOnce();
  });
});
