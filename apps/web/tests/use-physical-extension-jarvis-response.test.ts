/**
 * usePhysicalExtension — jarvis-response-* SSE event forwarding.
 *
 * Verifies:
 *   1. jarvis-response-start SSE event dispatches window 'jarvis-response-start' CustomEvent.
 *   2. jarvis-response-chunk SSE event dispatches window 'jarvis-response-chunk' CustomEvent with delta.
 *   3. jarvis-tool-call SSE event dispatches window 'jarvis-tool-call' CustomEvent.
 *   4. jarvis-response-end SSE event dispatches window 'jarvis-response-end' CustomEvent.
 */

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

describe("usePhysicalExtension — jarvis-response-* event forwarding", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dispatchSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(() => {
    dispatchSpy = vi.spyOn(window, "dispatchEvent");
  });

  afterEach(() => {
    dispatchSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("dispatches jarvis-response-start window event on SSE jarvis-response-start", () => {
    renderHook(() => usePhysicalExtension(true));

    act(() => {
      stubInstance.dispatchEvent(
        new MessageEvent("jarvis-response-start", {
          data: JSON.stringify({ turnId: "turn-abc", at: Date.now() }),
        }),
      );
    });

    const calls = dispatchSpy.mock.calls.filter(
      ([e]) => e instanceof CustomEvent && (e as CustomEvent).type === "jarvis-response-start",
    );
    expect(calls).toHaveLength(1);
    const detail = (calls[0]![0] as CustomEvent).detail as { turnId: string };
    expect(detail.turnId).toBe("turn-abc");
  });

  it("dispatches jarvis-response-chunk window event with delta", () => {
    renderHook(() => usePhysicalExtension(true));

    act(() => {
      stubInstance.dispatchEvent(
        new MessageEvent("jarvis-response-chunk", {
          data: JSON.stringify({ turnId: "turn-abc", delta: "Hello, sir.", at: Date.now() }),
        }),
      );
    });

    const calls = dispatchSpy.mock.calls.filter(
      ([e]) => e instanceof CustomEvent && (e as CustomEvent).type === "jarvis-response-chunk",
    );
    expect(calls).toHaveLength(1);
    const detail = (calls[0]![0] as CustomEvent).detail as { turnId: string; delta: string };
    expect(detail.delta).toBe("Hello, sir.");
    expect(detail.turnId).toBe("turn-abc");
  });

  it("dispatches jarvis-tool-call window event with name and result", () => {
    renderHook(() => usePhysicalExtension(true));

    act(() => {
      stubInstance.dispatchEvent(
        new MessageEvent("jarvis-tool-call", {
          data: JSON.stringify({
            turnId: "turn-abc",
            toolUseId: "tu_1",
            name: "create_capture",
            result: { ok: true, id: "cap_1", receipt: { content: "note" } },
            at: Date.now(),
          }),
        }),
      );
    });

    const calls = dispatchSpy.mock.calls.filter(
      ([e]) => e instanceof CustomEvent && (e as CustomEvent).type === "jarvis-tool-call",
    );
    expect(calls).toHaveLength(1);
    const detail = (calls[0]![0] as CustomEvent).detail as {
      name: string;
      toolUseId: string;
      result: { ok: boolean };
    };
    expect(detail.name).toBe("create_capture");
    expect(detail.result.ok).toBe(true);
  });

  it("dispatches jarvis-response-end window event", () => {
    renderHook(() => usePhysicalExtension(true));

    act(() => {
      stubInstance.dispatchEvent(
        new MessageEvent("jarvis-response-end", {
          data: JSON.stringify({ turnId: "turn-abc", at: Date.now() }),
        }),
      );
    });

    const calls = dispatchSpy.mock.calls.filter(
      ([e]) => e instanceof CustomEvent && (e as CustomEvent).type === "jarvis-response-end",
    );
    expect(calls).toHaveLength(1);
    const detail = (calls[0]![0] as CustomEvent).detail as { turnId: string };
    expect(detail.turnId).toBe("turn-abc");
  });
});
