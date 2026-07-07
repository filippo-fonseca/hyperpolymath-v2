import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// motion's real `useReducedMotion` reads a cached module singleton (lazily
// initialised from matchMedia on first use), so re-stubbing matchMedia mid-file
// is unreliable. Mock ONLY that hook — everything else in motion/react is real.
const motionMock = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => motionMock.reduced };
});

import { HandControlOnboarding } from "@/components/studio/onboarding/HandControlOnboarding";
import { StudioHandReticle } from "@/components/studio/cursor/StudioHandReticle";
import { StudioDebugCursor } from "@/lib/studio/input/debug-cursor";
import type { HandDriverStatus } from "@/lib/studio/input/drivers/hand";
import { StudioInputProvider, useStudioDomTarget } from "@/lib/studio/input/react";
import type {
  StudioDriverEnv,
  StudioInputDriver,
  StudioInputSink,
} from "@/lib/studio/input/types";
import { __resetActiveWidgets, activateWidget, collapseAll } from "@/lib/studio/state/active-widget";
import { __resetHandStatus, getHandStatus, publishHandStatus } from "@/lib/studio/state/hand-status";

/** Flush a requestAnimationFrame turn (hover resolution is rAF-coalesced). */
async function flushRaf(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** A fake driver that captures the sink so tests can drive the hub imperatively. */
class FakeDriver implements StudioInputDriver {
  readonly id = "fake";
  sink: StudioInputSink | null = null;
  env: StudioDriverEnv | null = null;
  stopped = false;
  start(sink: StudioInputSink, env: StudioDriverEnv) {
    this.sink = sink;
    this.env = env;
  }
  stop() {
    this.stopped = true;
  }
}

function stubMatchMedia(reduced: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function reticle(): HTMLElement {
  const el = document.querySelector("[data-studio-reticle]");
  if (!el) throw new Error("reticle not found");
  return el as HTMLElement;
}

beforeEach(() => {
  stubMatchMedia(false);
  motionMock.reduced = false;
  window.localStorage.clear();
});

afterEach(() => {
  __resetHandStatus();
  __resetActiveWidgets();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// A probe that registers a full-stage DOM hover target so the hub resolves hover.
function HoverProbe({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useStudioDomTarget(id, ref);
  return <div ref={ref} data-testid={id} />;
}

function mockFullStage(el: HTMLElement): void {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
    x: 0,
    y: 0,
    toJSON() {},
  } as DOMRect);
}

describe("StudioHandReticle", () => {
  // 1 — hidden in mouse mode (cursor.active but hand driver not running).
  it("stays hidden in mouse mode", () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <StudioHandReticle />
      </StudioInputProvider>,
    );
    act(() => {
      driver.sink!.moveCursor(0.5, 0.5);
    });
    expect(reticle().getAttribute("data-reticle-visible")).toBe("false");
    expect(reticle().style.opacity).toBe("0");
  });

  // 2 — visible in hand mode.
  it("becomes visible when hand mode is running and the cursor is active", () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <StudioHandReticle />
      </StudioInputProvider>,
    );
    act(() => {
      publishHandStatus({ state: "running", handVisible: true });
      driver.sink!.moveCursor(0.25, 0.75);
    });
    expect(reticle().getAttribute("data-reticle-visible")).toBe("true");
    expect(reticle().style.opacity).toBe("1");
  });

  // 3 — the gate is `running`, not `pref`: pre-running states stay hidden.
  it("stays hidden while the driver is loading / awaiting permission", () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <StudioHandReticle />
      </StudioInputProvider>,
    );
    act(() => {
      driver.sink!.moveCursor(0.5, 0.5);
      publishHandStatus({ state: "loading-model" });
    });
    expect(reticle().getAttribute("data-reticle-visible")).toBe("false");
    act(() => {
      publishHandStatus({ state: "awaiting-permission" });
    });
    expect(reticle().getAttribute("data-reticle-visible")).toBe("false");
  });

  // 4 — follows the cursor via translate3d (stage = viewport in jsdom).
  it("follows the cursor position", () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <StudioHandReticle />
      </StudioInputProvider>,
    );
    act(() => {
      publishHandStatus({ state: "running", handVisible: true });
      driver.sink!.moveCursor(0.25, 0.75);
    });
    const x = 0.25 * window.innerWidth;
    const y = 0.75 * window.innerHeight;
    expect(reticle().style.transform).toBe(`translate3d(${x}px, ${y}px, 0)`);
  });

  // 5 — hides when the hand is lost (cursor inactive) and on turn-off (null).
  it("hides when the hand is lost or hand mode turns off", () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <StudioHandReticle />
      </StudioInputProvider>,
    );
    act(() => {
      publishHandStatus({ state: "running", handVisible: true });
      driver.sink!.moveCursor(0.5, 0.5);
    });
    expect(reticle().getAttribute("data-reticle-visible")).toBe("true");

    act(() => {
      driver.sink!.setCursorActive(false);
    });
    expect(reticle().getAttribute("data-reticle-visible")).toBe("false");

    act(() => {
      driver.sink!.setCursorActive(true);
      publishHandStatus(null);
    });
    expect(reticle().getAttribute("data-reticle-visible")).toBe("false");
  });

  // 6 — hover snap: data-reticle-hover flips with the resolved hover target.
  it("reflects hover state", async () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <StudioHandReticle />
        <HoverProbe id="tasks" />
      </StudioInputProvider>,
    );
    act(() => {
      publishHandStatus({ state: "running", handVisible: true });
    });
    mockFullStage(screen.getByTestId("tasks"));

    act(() => {
      driver.sink!.moveCursor(0.5, 0.5);
    });
    await flushRaf();
    expect(reticle().getAttribute("data-reticle-hover")).toBe("true");

    act(() => {
      driver.sink!.setCursorActive(false);
    });
    await flushRaf();
    expect(reticle().getAttribute("data-reticle-hover")).toBe("false");
  });

  // 7 — expand feedback (hub upgrades expand from the hover target), clears after 450ms.
  it("shows and clears expand feedback", async () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <StudioHandReticle />
        <HoverProbe id="tasks" />
      </StudioInputProvider>,
    );
    act(() => {
      publishHandStatus({ state: "running", handVisible: true });
    });
    mockFullStage(screen.getByTestId("tasks"));
    act(() => {
      driver.sink!.moveCursor(0.5, 0.5);
    });
    await flushRaf();

    vi.useFakeTimers();
    act(() => {
      driver.sink!.emitIntent({ type: "expand" });
    });
    expect(reticle().getAttribute("data-reticle-feedback")).toBe("expand");

    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(reticle().getAttribute("data-reticle-feedback")).toBe("");
  });

  // 8 — collapse + swipe feedback (no hover needed; pass through the hub untouched).
  it("shows collapse and swipe feedback with a flick direction", () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <StudioHandReticle />
      </StudioInputProvider>,
    );
    act(() => {
      publishHandStatus({ state: "running", handVisible: true });
      driver.sink!.moveCursor(0.5, 0.5);
    });

    vi.useFakeTimers();

    act(() => {
      driver.sink!.emitIntent({ type: "collapse" });
    });
    expect(reticle().getAttribute("data-reticle-feedback")).toBe("collapse");
    expect(reticle().getAttribute("data-reticle-flick-dir")).toBe("");

    act(() => {
      driver.sink!.emitIntent({ type: "swipeLeft" });
    });
    expect(reticle().getAttribute("data-reticle-feedback")).toBe("swipeLeft");
    expect(reticle().getAttribute("data-reticle-flick-dir")).toBe("left");

    act(() => {
      driver.sink!.emitIntent({ type: "swipeRight" });
    });
    expect(reticle().getAttribute("data-reticle-feedback")).toBe("swipeRight");
    expect(reticle().getAttribute("data-reticle-flick-dir")).toBe("right");
  });

  // 9 — rapid intents replace (single timer), not stack.
  it("replaces feedback on a rapid second intent", () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <StudioHandReticle />
      </StudioInputProvider>,
    );
    act(() => {
      publishHandStatus({ state: "running", handVisible: true });
      driver.sink!.moveCursor(0.5, 0.5);
    });

    vi.useFakeTimers();
    act(() => {
      driver.sink!.emitIntent({ type: "collapse" });
    });
    act(() => {
      vi.advanceTimersByTime(200);
      driver.sink!.emitIntent({ type: "swipeLeft" });
    });
    expect(reticle().getAttribute("data-reticle-feedback")).toBe("swipeLeft");

    // The first timer must not clear the (newer) feedback early.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(reticle().getAttribute("data-reticle-feedback")).toBe("swipeLeft");

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(reticle().getAttribute("data-reticle-feedback")).toBe("");
  });

  // 10 — dims to 0.3 while a widget is expanded; restores on collapse.
  it("dims while a widget is expanded", () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <StudioHandReticle />
      </StudioInputProvider>,
    );
    act(() => {
      publishHandStatus({ state: "running", handVisible: true });
      driver.sink!.moveCursor(0.5, 0.5);
    });
    expect(reticle().style.opacity).toBe("1");

    act(() => {
      activateWidget("tasks");
    });
    expect(reticle().getAttribute("data-reticle-dimmed")).toBe("true");
    expect(reticle().style.opacity).toBe("0.3");

    act(() => {
      collapseAll();
    });
    expect(reticle().getAttribute("data-reticle-dimmed")).toBe("false");
    expect(reticle().style.opacity).toBe("1");
  });

  // 11 — writer integration: useHandControl publishes to the shared store.
  it("becomes visible/hidden through the useHandControl writer", () => {
    const driver = new FakeDriver();
    let emitStatus: (s: HandDriverStatus) => void = () => {};
    const createDriver = vi.fn(
      ({ onStatusChange }: { onStatusChange: (s: HandDriverStatus) => void }) => {
        emitStatus = onStatusChange;
        return new FakeDriver();
      },
    );

    render(
      <StudioInputProvider drivers={[driver]}>
        <StudioHandReticle />
        <HandControlOnboarding createDriver={createDriver} />
      </StudioInputProvider>,
    );

    act(() => {
      driver.sink!.moveCursor(0.5, 0.5);
    });
    // First visit → hidden until opt-in.
    expect(reticle().getAttribute("data-reticle-visible")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Enable hand control" }));
    act(() => {
      emitStatus({ state: "running", handVisible: true });
    });
    expect(getHandStatus()).toEqual({ state: "running", handVisible: true });
    expect(reticle().getAttribute("data-reticle-visible")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(getHandStatus()).toBeNull();
    expect(reticle().getAttribute("data-reticle-visible")).toBe("false");
  });

  // 12 — reduced motion: feedback still tracked, but the reduced flag is set.
  // motion's `useReducedMotion` reads a module singleton it lazily inits from
  // matchMedia on first use (and caches for the file), so re-stubbing matchMedia
  // is unreliable. Set the singleton directly for a deterministic assertion.
  it("honors reduced motion", async () => {
    motionMock.reduced = true;
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <StudioHandReticle />
        <HoverProbe id="tasks" />
      </StudioInputProvider>,
    );
    expect(reticle().getAttribute("data-reticle-reduced")).toBe("true");

    act(() => {
      publishHandStatus({ state: "running", handVisible: true });
    });
    mockFullStage(screen.getByTestId("tasks"));
    act(() => {
      driver.sink!.moveCursor(0.5, 0.5);
    });
    await flushRaf();

    // Feedback is still tracked under reduced motion (only the visual cue differs).
    act(() => {
      driver.sink!.emitIntent({ type: "expand" });
    });
    expect(reticle().getAttribute("data-reticle-feedback")).toBe("expand");
  });

  // 13 — coexists with the debug cursor; its Playwright attributes are untouched.
  it("coexists with StudioDebugCursor without clobbering its attributes", () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <StudioHandReticle />
        <StudioDebugCursor />
      </StudioInputProvider>,
    );
    const debug = document.querySelector("[data-studio-cursor]");
    expect(debug).not.toBeNull();
    expect(reticle()).not.toBeNull();
    // The debug cursor keeps its own namespace; the reticle never sets it.
    expect(reticle().hasAttribute("data-studio-cursor")).toBe(false);
    expect(debug!.hasAttribute("data-studio-reticle")).toBe(false);
  });
});
