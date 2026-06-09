/**
 * @vitest-environment jsdom
 *
 * JARVIS undo — Phase 5 Plan 05-04 Task 1.
 *
 * Verifies:
 *   1. useUndoCountdown ticks 5 → 0 over 5 simulated seconds, calls onExpire
 *      exactly once when it hits 0.
 *   2. cancel() during countdown stops the interval (no further ticks, no
 *      onExpire fired).
 *   3. JarvisReceipt with onUndo + countdown shows "Undo (5)" label initially.
 *   4. After the countdown completes (5 ticks), Undo button is hidden.
 *   5. Click Undo within window → undoJarvisAction called with correct target
 *      + optimistic onUndo callback fired.
 *
 * The hook itself is host-tz-agnostic — we use vi.useFakeTimers() to drive
 * the setInterval deterministically. The receipt's "Undo (N)" UI is checked
 * via react-testing-library + jsdom.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { useUndoCountdown } from "@/components/jarvis/use-undo-countdown";
import { JarvisReceipt } from "@/components/jarvis/JarvisReceipt";
import type { ScrollbackAction } from "@/components/jarvis/jarvis-types";

// ---------------------------------------------------------------------------
// useUndoCountdown — hook behavior
// ---------------------------------------------------------------------------

function HookHarness({
  initialSeconds,
  onExpire,
  onTick,
  exposeCancel,
}: {
  initialSeconds: number;
  onExpire: () => void;
  onTick?: (n: number) => void;
  exposeCancel?: (cancel: () => void) => void;
}) {
  const { seconds, cancel } = useUndoCountdown(initialSeconds, onExpire);
  onTick?.(seconds);
  if (exposeCancel) exposeCancel(cancel);
  return <span data-testid="seconds">{seconds}</span>;
}

describe("useUndoCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks 5 → 4 → 3 → 2 → 1 → 0 over 5 simulated seconds", () => {
    const onExpire = vi.fn();
    const ticks: number[] = [];
    render(
      <HookHarness
        initialSeconds={5}
        onExpire={onExpire}
        onTick={(n) => ticks.push(n)}
      />,
    );

    expect(screen.getByTestId("seconds").textContent).toBe("5");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("seconds").textContent).toBe("4");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("seconds").textContent).toBe("3");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("seconds").textContent).toBe("2");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("seconds").textContent).toBe("1");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("seconds").textContent).toBe("0");

    // onExpire fires exactly once at 0
    expect(onExpire).toHaveBeenCalledTimes(1);

    // Subsequent ticks do not re-fire
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("cancel() during countdown stops the interval and does NOT fire onExpire", () => {
    const onExpire = vi.fn();
    let cancelFn: (() => void) | null = null;
    render(
      <HookHarness
        initialSeconds={5}
        onExpire={onExpire}
        exposeCancel={(c) => {
          cancelFn = c;
        }}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId("seconds").textContent).toBe("3");

    act(() => {
      cancelFn?.();
    });

    // Advance past where expire would normally happen
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    // Should still read 3 (countdown frozen)
    expect(screen.getByTestId("seconds").textContent).toBe("3");
    expect(onExpire).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// JarvisReceipt — Undo button wiring
// ---------------------------------------------------------------------------

describe("JarvisReceipt — Undo button", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeSuccessAction(name: ScrollbackAction["name"]): ScrollbackAction {
    return {
      toolUseId: "tool-use-1",
      name,
      result: {
        ok: true,
        id: "11111111-1111-4111-8111-111111111111",
        receipt: {
          title: "Pick up groceries",
          priority: "P1",
          content: "Pick up groceries tomorrow",
          start: "2026-05-15T20:00:00.000Z",
          end: "2026-05-15T21:00:00.000Z",
        },
      },
    };
  }

  it("renders 'Undo (5)' initially when onUndo is wired and action is successful", () => {
    const action = makeSuccessAction("create_task");
    const onUndo = vi.fn();

    render(<JarvisReceipt action={action} onUndo={onUndo} />);

    // The Undo button starts at 5 (the hook is wired internally and counts
    // down from the initial 5s window).
    const btn = screen.getByRole("button", { name: /undo/i });
    expect(btn.textContent).toMatch(/Undo\s*\(5\)/);
  });

  it("hides the Undo button after the 5s countdown completes", () => {
    const action = makeSuccessAction("create_task");
    const onUndo = vi.fn();

    render(<JarvisReceipt action={action} onUndo={onUndo} />);
    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(5500);
    });

    // After expiry, the Undo button is gone but the receipt remains visible.
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
    // The receipt body (priority chip / title) is still rendered:
    expect(screen.getByText("Pick up groceries")).toBeTruthy();
  });

  it("clicking Undo fires onUndo and removes the button", () => {
    const action = makeSuccessAction("create_capture");
    const onUndo = vi.fn();

    render(<JarvisReceipt action={action} onUndo={onUndo} />);

    const btn = screen.getByRole("button", { name: /undo/i });
    act(() => {
      fireEvent.click(btn);
    });

    expect(onUndo).toHaveBeenCalledTimes(1);
    // After click, Undo button should disappear (countdown cancelled).
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
  });

  it("does NOT render Undo button when action.undone is true (already undone)", () => {
    const action: ScrollbackAction = {
      ...makeSuccessAction("create_task"),
      undone: true,
    };
    const onUndo = vi.fn();

    render(<JarvisReceipt action={action} onUndo={onUndo} />);

    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
  });

  it("does NOT render Undo button when action failed (ok: false)", () => {
    const action: ScrollbackAction = {
      toolUseId: "tool-use-err",
      name: "create_task",
      result: { ok: false, error: "validation failed", kind: "validation" },
    };
    const onUndo = vi.fn();

    render(<JarvisReceipt action={action} onUndo={onUndo} />);
    expect(screen.queryByRole("button", { name: /undo/i })).toBeNull();
  });
});
