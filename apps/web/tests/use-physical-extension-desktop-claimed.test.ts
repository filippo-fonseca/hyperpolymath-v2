import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { act } from "react";

import { usePhysicalExtension } from "@/lib/voice/physical-extension/use-physical-extension";

class StubEventSource extends EventTarget {
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  url: string;
  readyState = 1;
  close = vi.fn();
  addEventListener = vi.fn((type: string, handler: EventListener) =>
    super.addEventListener(type, handler),
  );
  removeEventListener = vi.fn((type: string, handler: EventListener) =>
    super.removeEventListener(type, handler),
  );
  constructor(url: string) {
    super();
    this.url = url;
  }
}

let stubInstance: StubEventSource;

vi.stubGlobal(
  "EventSource",
  vi.fn().mockImplementation((url: string) => {
    stubInstance = new StubEventSource(url);
    return stubInstance;
  }),
);

describe("usePhysicalExtension — desktopClaimed guard + transcript listener", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dispatchSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(() => {
    dispatchSpy = vi.spyOn(window, "dispatchEvent");
  });

  afterEach(() => {
    dispatchSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("does NOT dispatch jarvis-wake-fire when desktopClaimed === true", () => {
    renderHook(() => usePhysicalExtension(true));

    act(() => {
      stubInstance.dispatchEvent(
        new MessageEvent("trigger", {
          data: JSON.stringify({
            source: "arduino-df2301q",
            commandId: 1,
            at: Date.now(),
            desktopClaimed: true,
          }),
        }),
      );
    });

    const wakeFireCalls = dispatchSpy.mock.calls.filter(
      ([e]) => e instanceof CustomEvent && (e as CustomEvent).type === "jarvis-wake-fire",
    );
    expect(wakeFireCalls).toHaveLength(0);
  });

  it("DOES dispatch jarvis-wake-fire when desktopClaimed === false", () => {
    renderHook(() => usePhysicalExtension(true));

    act(() => {
      stubInstance.dispatchEvent(
        new MessageEvent("trigger", {
          data: JSON.stringify({
            source: "arduino-df2301q",
            commandId: 1,
            at: Date.now(),
            desktopClaimed: false,
          }),
        }),
      );
    });

    const wakeFireCalls = dispatchSpy.mock.calls.filter(
      ([e]) => e instanceof CustomEvent && (e as CustomEvent).type === "jarvis-wake-fire",
    );
    expect(wakeFireCalls).toHaveLength(1);
  });

  it("DOES dispatch jarvis-wake-fire when desktopClaimed is undefined (backward-compat)", () => {
    renderHook(() => usePhysicalExtension(true));

    act(() => {
      stubInstance.dispatchEvent(
        new MessageEvent("trigger", {
          data: JSON.stringify({
            source: "arduino-df2301q",
            commandId: 2,
            at: Date.now(),
          }),
        }),
      );
    });

    const wakeFireCalls = dispatchSpy.mock.calls.filter(
      ([e]) => e instanceof CustomEvent && (e as CustomEvent).type === "jarvis-wake-fire",
    );
    expect(wakeFireCalls).toHaveLength(1);
  });

  it("dispatches jarvis-voice-transcript on transcript SSE event", () => {
    renderHook(() => usePhysicalExtension(true));

    act(() => {
      stubInstance.dispatchEvent(
        new MessageEvent("transcript", {
          data: JSON.stringify({
            transcript: "test command",
            sttDoneAt: 123,
            vadEndAt: 100,
            at: 123,
          }),
        }),
      );
    });

    const transcriptCalls = dispatchSpy.mock.calls.filter(
      ([e]) => e instanceof CustomEvent && (e as CustomEvent).type === "jarvis-voice-transcript",
    );
    expect(transcriptCalls).toHaveLength(1);
    const detail = (transcriptCalls[0]![0] as CustomEvent).detail as {
      transcript: string;
      sttDoneAt: number;
      vadEndAt: number;
    };
    expect(detail.transcript).toBe("test command");
    expect(detail.sttDoneAt).toBe(123);
    expect(detail.vadEndAt).toBe(100);
  });
});
