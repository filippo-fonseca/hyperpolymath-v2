import { act, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The five widget adapters wrap real app components that statically import
// server actions (`"use server"`), which don't belong in jsdom. Mock them with
// trivial identifiable bodies so this suite exercises the overlay's OWN
// swipe-paging job: the single-writer swipe→store wiring, the wrap-around
// carousel, and that paging never collapses the overlay. Data plumbing is
// covered by typecheck (mirrors studio-focus-overlay.test.tsx).
vi.mock("@/components/studio/overlay/widgets/TasksFocus", () => ({
  TasksFocus: () => <div data-testid="tasks-focus">tasks body</div>,
}));
vi.mock("@/components/studio/overlay/widgets/CapturesFocus", () => ({
  CapturesFocus: () => <div data-testid="captures-focus">captures body</div>,
}));
vi.mock("@/components/studio/overlay/widgets/AgendaFocus", () => ({
  AgendaFocus: () => <div data-testid="agenda-focus">agenda body</div>,
}));
vi.mock("@/components/studio/overlay/widgets/HabitsFocus", () => ({
  HabitsFocus: () => <div data-testid="habits-focus">habits body</div>,
}));
vi.mock("@/components/studio/overlay/widgets/JournalFocus", () => ({
  JournalFocus: () => <div data-testid="journal-focus">journal body</div>,
}));

import { StudioInputProvider } from "@/lib/studio/input/react";
import { useStudioDomTarget } from "@/lib/studio/input/react";
import type {
  StudioDriverEnv,
  StudioInputDriver,
  StudioInputSink,
} from "@/lib/studio/input/types";
import { StudioFocusOverlay } from "@/components/studio/overlay/StudioFocusOverlay";
import {
  __resetActiveWidgets,
  getActiveWidgets,
} from "@/lib/studio/state/active-widget";

/** Report reduced motion so motion transitions resolve instantly (duration 0). */
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  __resetActiveWidgets();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Flush a requestAnimationFrame turn (hover resolution is rAF-coalesced). */
async function flushRaf(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/** A fake driver that captures the sink so the test drives the hub directly. */
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

/**
 * Registers one full-viewport DOM hover target ("tasks") so a targetless
 * `expand` upgrades to "tasks" from any cursor position — the real mouse path,
 * minus a raycast. Swipes are targetless intents, so hover is irrelevant to
 * paging itself; this only gets us into a focused state to page from.
 */
function TargetHarness() {
  const tasksRef = useRef<HTMLDivElement>(null);
  useStudioDomTarget("tasks", tasksRef);
  return (
    <>
      <div ref={tasksRef} data-testid="tile-tasks" />
      <StudioFocusOverlay />
    </>
  );
}

function mockRect(el: HTMLElement, r: Partial<DOMRect>): void {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    toJSON() {},
    ...r,
  } as DOMRect);
}

function renderStudio() {
  const driver = new FakeDriver();
  render(
    <StudioInputProvider drivers={[driver]}>
      <TargetHarness />
    </StudioInputProvider>,
  );
  const w = window.innerWidth;
  const h = window.innerHeight;
  // "tasks" covers the whole viewport → any hover resolves to it.
  mockRect(screen.getByTestId("tile-tasks"), {
    left: 0,
    top: 0,
    right: w,
    bottom: h,
    width: w,
    height: h,
  });
  return driver;
}

/** Hover the stage and expand → opens the overlay on "tasks". */
async function expandTasks(driver: FakeDriver): Promise<void> {
  act(() => {
    driver.sink!.moveCursor(0.5, 0.5);
  });
  await flushRaf();
  act(() => {
    driver.sink!.emitIntent({ type: "expand" });
  });
  await screen.findByTestId("tasks-focus");
}

describe("StudioFocusOverlay — swipe paging", () => {
  it("no-ops a swipe when nothing is focused (overlay stays closed)", async () => {
    const driver = renderStudio();

    expect(screen.queryByTestId("studio-focus-overlay")).toBeNull();

    act(() => {
      driver.sink!.emitIntent({ type: "swipeRight" });
    });
    await flushRaf();

    expect(screen.queryByTestId("studio-focus-overlay")).toBeNull();
    expect(getActiveWidgets()).toEqual([]);
  });

  it("pages to the next widget on swipeRight", async () => {
    const driver = renderStudio();
    await expandTasks(driver);
    expect(getActiveWidgets()).toEqual(["tasks"]);

    act(() => {
      driver.sink!.emitIntent({ type: "swipeRight" });
    });

    expect(await screen.findByTestId("captures-focus")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("tasks-focus")).toBeNull(),
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Captures");
    expect(getActiveWidgets()).toEqual(["captures"]);
  });

  it("pages to the previous widget on swipeLeft", async () => {
    const driver = renderStudio();
    await expandTasks(driver);

    // tasks → captures (next), then captures → tasks (prev).
    act(() => {
      driver.sink!.emitIntent({ type: "swipeRight" });
    });
    await screen.findByTestId("captures-focus");

    act(() => {
      driver.sink!.emitIntent({ type: "swipeLeft" });
    });

    expect(await screen.findByTestId("tasks-focus")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("captures-focus")).toBeNull(),
    );
    expect(getActiveWidgets()).toEqual(["tasks"]);
  });

  it("wraps around at both ends", async () => {
    const driver = renderStudio();
    await expandTasks(driver);

    // prev from the first widget wraps to the last (journal).
    act(() => {
      driver.sink!.emitIntent({ type: "swipeLeft" });
    });
    expect(await screen.findByTestId("journal-focus")).toBeInTheDocument();
    expect(getActiveWidgets()).toEqual(["journal"]);

    // next from the last widget wraps back to the first (tasks).
    act(() => {
      driver.sink!.emitIntent({ type: "swipeRight" });
    });
    expect(await screen.findByTestId("tasks-focus")).toBeInTheDocument();
    expect(getActiveWidgets()).toEqual(["tasks"]);
  });

  it("stays open across a full lap of five next pages", async () => {
    const driver = renderStudio();
    await expandTasks(driver);

    for (let step = 0; step < 5; step += 1) {
      act(() => {
        driver.sink!.emitIntent({ type: "swipeRight" });
      });
      // Overlay must remain mounted at every step of the lap.
      expect(screen.getByTestId("studio-focus-overlay")).toBeInTheDocument();
    }

    expect(await screen.findByTestId("tasks-focus")).toBeInTheDocument();
    expect(screen.getByTestId("studio-focus-overlay")).toBeInTheDocument();
    expect(getActiveWidgets()).toEqual(["tasks"]);
  });

  it("collapse still works after paging", async () => {
    const driver = renderStudio();
    await expandTasks(driver);

    act(() => {
      driver.sink!.emitIntent({ type: "swipeRight" });
    });
    await screen.findByTestId("captures-focus");

    act(() => {
      driver.sink!.emitIntent({ type: "collapse" });
    });
    await waitFor(() =>
      expect(screen.queryByTestId("studio-focus-overlay")).toBeNull(),
    );
    expect(getActiveWidgets()).toEqual([]);
  });
});
