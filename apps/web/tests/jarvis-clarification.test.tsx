/**
 * Phase 5.1 (D-A2 / JARVIS-19) — JarvisClarification UI component tests.
 *
 * TDD GREEN: these tests drive the JarvisClarification component's full
 * interaction surface: question display, chip options, reply input, and
 * answered/disabled state.
 */

import { render, fireEvent, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { JarvisClarification } from "@/components/jarvis/JarvisClarification";
import type { ScrollbackClarification } from "@/components/jarvis/jarvis-types";

const baseClarification: ScrollbackClarification = {
  toolUseId: "tu_test",
  question: "Saturday or Sunday?",
  options: ["Saturday", "Sunday"],
  suggestedAction: null,
  answered: false,
};

describe("JarvisClarification (JARVIS-19 / D-A2)", () => {
  it("renders question text + chip options + reply input when not answered", () => {
    const onReply = vi.fn();
    render(<JarvisClarification clarification={baseClarification} onReply={onReply} />);

    expect(screen.getByText("Saturday or Sunday?")).toBeTruthy();
    expect(screen.getByText("Saturday")).toBeTruthy();
    expect(screen.getByText("Sunday")).toBeTruthy();
    expect(screen.getByPlaceholderText(/type a reply/i)).toBeTruthy();
  });

  it("clicking a chip option calls onReply with that chip's text (WITHOUT prefix)", () => {
    const onReply = vi.fn();
    render(
      <JarvisClarification
        clarification={baseClarification}
        onReply={onReply}
      />,
    );
    fireEvent.click(screen.getByText("Saturday"));
    expect(onReply).toHaveBeenCalledWith("Saturday");
    // Console is responsible for prepending [CLARIFICATION REPLY]
    expect(onReply).not.toHaveBeenCalledWith(
      expect.stringContaining("[CLARIFICATION REPLY]"),
    );
  });

  it("clicking second chip option calls onReply correctly", () => {
    const onReply = vi.fn();
    render(
      <JarvisClarification
        clarification={baseClarification}
        onReply={onReply}
      />,
    );
    fireEvent.click(screen.getByText("Sunday"));
    expect(onReply).toHaveBeenCalledWith("Sunday");
  });

  it("typing in free-text + pressing Enter calls onReply(typedText)", () => {
    const onReply = vi.fn();
    render(
      <JarvisClarification
        clarification={baseClarification}
        onReply={onReply}
      />,
    );
    const input = screen.getByPlaceholderText(/type a reply/i);
    fireEvent.change(input, { target: { value: "Next Saturday" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onReply).toHaveBeenCalledWith("Next Saturday");
  });

  it("Send button click calls onReply with typed text", () => {
    const onReply = vi.fn();
    render(
      <JarvisClarification
        clarification={baseClarification}
        onReply={onReply}
      />,
    );
    const input = screen.getByPlaceholderText(/type a reply/i);
    fireEvent.change(input, { target: { value: "Tonight" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onReply).toHaveBeenCalledWith("Tonight");
  });

  it("answered state disables inputs and shows 'answered' indicator", () => {
    const onReply = vi.fn();
    render(
      <JarvisClarification
        clarification={{ ...baseClarification, answered: true }}
        onReply={onReply}
      />,
    );
    expect(screen.getByText(/answered/i)).toBeTruthy();
    // Reply input is hidden when answered
    expect(screen.queryByPlaceholderText(/type a reply/i)).toBeNull();
    // Chip options are also hidden when answered
    expect(screen.queryByRole("button", { name: /saturday/i })).toBeNull();
  });

  it("no onReply prop also disables the component (shows answered indicator)", () => {
    render(
      <JarvisClarification
        clarification={{ ...baseClarification, answered: false }}
        // No onReply — component should also show answered state
      />,
    );
    // Without onReply, disabled=true, so answered indicator shows
    expect(screen.getByText(/answered/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/type a reply/i)).toBeNull();
  });

  it("renders 'clarify' chrome label (UI-SPEC §5a)", () => {
    // Phase 6.1 Plan 02: the Phase 5.1 "QUESTION" label was retired in favor
    // of a lowercase mono 'clarify' chrome label per UI-SPEC §5a +
    // §12c — clarification surface bridges agent (HUD chrome) and doc
    // (serif body) registers.
    render(
      <JarvisClarification clarification={baseClarification} onReply={vi.fn()} />,
    );
    expect(screen.getByText("clarify")).toBeTruthy();
  });

  it("renders correctly with no chip options (free-text only mode)", () => {
    const onReply = vi.fn();
    render(
      <JarvisClarification
        clarification={{ ...baseClarification, options: [] }}
        onReply={onReply}
      />,
    );
    // No chip buttons
    expect(screen.queryByRole("button", { name: /saturday/i })).toBeNull();
    // Free-text input still present
    expect(screen.getByPlaceholderText(/type a reply/i)).toBeTruthy();
  });
});
