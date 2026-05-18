/**
 * JarvisReceipt — jarvis_suggested Keep/Discard UI tests (Blocker 2 / D-M3 / JARVIS-18).
 *
 * Phase 5.1 Plan 05.1-03 Task 2.
 *
 * Tests the rendering and interaction of the suggested-fact branch in JarvisReceipt.
 * When `action.name === "remember_fact"` AND `result.receipt.source === "jarvis_suggested"`:
 *   - Renders Keep + Discard buttons
 *   - Shows 10s countdown ("auto-keep in 10s")
 *   - Discard click invokes forgetFactAction with the receipt's factId
 *   - Keep click cancels the countdown (fact stays persisted — no-op)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { JarvisReceipt } from "@/components/jarvis/JarvisReceipt";

// ---------------------------------------------------------------------------
// Hoisted mocks — must use vi.hoisted to avoid TDZ issues with module mocks
// ---------------------------------------------------------------------------

const { forgetFactActionMock } = vi.hoisted(() => ({
  forgetFactActionMock: vi.fn(),
}));

vi.mock("@/app/actions/jarvis-facts", () => ({
  forgetFactAction: forgetFactActionMock,
  rememberFactAction: vi.fn(async () => ({ ok: true, id: "x" })),
}));

// scrollIntoView not in jsdom — standard workaround
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}

beforeEach(() => {
  forgetFactActionMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// jarvis_suggested branch
// ---------------------------------------------------------------------------

describe("JarvisReceipt — jarvis_suggested Keep/Discard (Blocker 2 / D-M3)", () => {
  const suggestedAction = {
    toolUseId: "tu_suggested_1",
    name: "remember_fact" as const,
    status: "done" as const,
    result: {
      ok: true as const,
      id: "fact:workflow:gym",
      receipt: {
        type: "workflow",
        key: "gym schedule",
        value: "Mon/Wed/Fri 6am",
        source: "jarvis_suggested",
        factId: "abc-fact-123",
      },
    },
  };

  it("renders Keep + Discard + 10s countdown for source==='jarvis_suggested'", () => {
    const { getByRole, getByText } = render(<JarvisReceipt action={suggestedAction} />);
    // Keep button (aria-label="Keep")
    expect(getByRole("button", { name: /^Keep$/i })).toBeTruthy();
    // Discard button (aria-label="Discard")
    expect(getByRole("button", { name: /^Discard$/i })).toBeTruthy();
    // Initial countdown shows 10s
    expect(getByText(/auto-keep in 10s/i)).toBeTruthy();
  });

  it("Discard button invokes forgetFactAction with the receipt factId", async () => {
    const { getByText } = render(<JarvisReceipt action={suggestedAction} />);
    fireEvent.click(getByText(/Discard/i));
    await waitFor(() =>
      expect(forgetFactActionMock).toHaveBeenCalledWith({ factId: "abc-fact-123" }),
    );
  });

  it("Keep button click cancels the countdown without calling forgetFactAction", async () => {
    const { getByText } = render(<JarvisReceipt action={suggestedAction} />);
    fireEvent.click(getByText(/^Keep$/i));
    // forgetFactAction should NOT be called — Keep = implicit no-op
    await new Promise((r) => setTimeout(r, 50));
    expect(forgetFactActionMock).not.toHaveBeenCalled();
  });

  it("user_explicit receipt does NOT render the suggested-fact branch", () => {
    const explicitAction = {
      ...suggestedAction,
      result: {
        ...suggestedAction.result,
        receipt: {
          ...suggestedAction.result.receipt,
          source: "user_explicit",
        },
      },
    };
    const { queryByText } = render(
      <JarvisReceipt action={explicitAction as typeof suggestedAction} />,
    );
    // No Keep/Discard affordance for user_explicit receipts
    expect(queryByText(/auto-keep in/i)).toBeNull();
  });
});
