import { act, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The five widget adapters wrap real app components that statically import
// server actions (`"use server"`), which don't belong in jsdom. Mock them with
// trivial identifiable bodies so this test exercises the overlay's OWN job:
// the single-writer intent→store wiring, open/switch/close, panel chrome, and
// scrim click-outside. The adapters' data plumbing is covered by typecheck.
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
 * Registers two DOM hover targets ("tasks" left half, "habits" right half) so
 * the hub can upgrade a targetless `expand` from the current cursor position —
 * exactly the real mouse path, minus a raycast.
 */
function TargetHarness() {
  const tasksRef = useRef<HTMLDivElement>(null);
  const habitsRef = useRef<HTMLDivElement>(null);
  useStudioDomTarget("tasks", tasksRef);
  useStudioDomTarget("habits", habitsRef);
  return (
    <>
      <div ref={tasksRef} data-testid="tile-tasks" />
      <div ref={habitsRef} data-testid="tile-habits" />
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

describe("StudioFocusOverlay", () => {
  it("opens on expand, swaps widget on a second expand, and closes on collapse", async () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <TargetHarness />
      </StudioInputProvider>,
    );

    // Left half → "tasks"; right half → "habits". Stage defaults to viewport.
    const w = window.innerWidth;
    const h = window.innerHeight;
    mockRect(screen.getByTestId("tile-tasks"), {
      left: 0,
      top: 0,
      right: w / 2,
      bottom: h,
      width: w / 2,
      height: h,
    });
    mockRect(screen.getByTestId("tile-habits"), {
      left: w / 2,
      top: 0,
      right: w,
      bottom: h,
      width: w / 2,
      height: h,
    });

    // Closed initially.
    expect(screen.queryByTestId("studio-focus-overlay")).toBeNull();

    // Hover the tasks half, then expand → overlay opens with Tasks.
    act(() => {
      driver.sink!.moveCursor(0.25, 0.5);
    });
    await flushRaf();
    act(() => {
      driver.sink!.emitIntent({ type: "expand" });
    });

    expect(await screen.findByTestId("studio-focus-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("tasks-focus")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Tasks");
    expect(getActiveWidgets()).toEqual(["tasks"]);

    // Hover the habits half, then expand → swaps in place to Habits.
    act(() => {
      driver.sink!.moveCursor(0.75, 0.5);
    });
    await flushRaf();
    act(() => {
      driver.sink!.emitIntent({ type: "expand" });
    });

    expect(await screen.findByTestId("habits-focus")).toBeInTheDocument();
    // The panel body now animates the swap via a nested AnimatePresence
    // (split-screen paging), so the outgoing widget unmounts one tick later —
    // await its removal rather than asserting it synchronously.
    await waitFor(() =>
      expect(screen.queryByTestId("tasks-focus")).toBeNull(),
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "Habits");
    expect(getActiveWidgets()).toEqual(["habits"]);

    // Collapse → overlay unmounts.
    act(() => {
      driver.sink!.emitIntent({ type: "collapse" });
    });
    await waitFor(() =>
      expect(screen.queryByTestId("studio-focus-overlay")).toBeNull(),
    );
    expect(getActiveWidgets()).toEqual([]);
  });

  it("collapses when the scrim (click-outside) is clicked", async () => {
    const driver = new FakeDriver();
    render(
      <StudioInputProvider drivers={[driver]}>
        <TargetHarness />
      </StudioInputProvider>,
    );

    const w = window.innerWidth;
    const h = window.innerHeight;
    mockRect(screen.getByTestId("tile-tasks"), {
      left: 0,
      top: 0,
      right: w,
      bottom: h,
      width: w,
      height: h,
    });

    act(() => {
      driver.sink!.moveCursor(0.5, 0.5);
    });
    await flushRaf();
    act(() => {
      driver.sink!.emitIntent({ type: "expand" });
    });

    const scrim = await screen.findByTestId("studio-focus-overlay");
    expect(scrim).toBeInTheDocument();

    act(() => {
      scrim.click();
    });
    await waitFor(() =>
      expect(screen.queryByTestId("studio-focus-overlay")).toBeNull(),
    );
    expect(getActiveWidgets()).toEqual([]);
  });
});
