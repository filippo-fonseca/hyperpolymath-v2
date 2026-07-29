import { RightSlotProvider } from "@/components/shell/cockpit/right-slot-context";
import { SidePanel, SidePanelHost } from "@/components/ui/SidePanel";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `SidePanel` contract, asserted rather than trusted (SDC-1 §2.8).
 *
 * These are the promises that make the panel "part of the page" instead of an
 * overlay, and every one of them is the kind of thing a well-meaning later edit
 * quietly breaks: add a portal for convenience, reach for a `fixed` wrapper,
 * let Radix take the body's pointer-events. The cockpit's own acceptance
 * criteria are computed-style assertions for exactly this reason.
 */

/** Desktop: at `lg` and above the panel is a grid sibling, not a sheet. */
function mockDesktopViewport() {
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
    }))
  );
}

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <RightSlotProvider>
      {/* Stands in for the stage: the panel is declared deep inside a feature's
          own tree, exactly as a real consumer would declare it. */}
      <div data-testid="stage">
        <SidePanel open={open} onClose={onClose} title="Task">
          <p>panel body</p>
        </SidePanel>
      </div>
      {/* Stands in for RightSlot. */}
      <div data-testid="right-slot">
        <SidePanelHost />
      </div>
    </RightSlotProvider>
  );
}

describe("SidePanel", () => {
  beforeEach(() => {
    mockDesktopViewport();
    document.body.style.pointerEvents = "";
  });

  it("renders its children in the host, not where it is declared", async () => {
    render(<Harness open onClose={() => {}} />);

    const body = await screen.findByText("panel body");
    expect(screen.getByTestId("right-slot")).toContainElement(body);
    expect(screen.getByTestId("stage")).not.toContainElement(body);
  });

  it("adds no fixed-position element and never touches body pointer-events", async () => {
    render(<Harness open onClose={() => {}} />);
    await screen.findByText("panel body");

    // No portal: everything it renders is inside the host we mounted.
    const fixed = Array.from(document.querySelectorAll("*")).filter(
      (el) => getComputedStyle(el).position === "fixed"
    );
    expect(fixed).toHaveLength(0);
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("labels itself as a complementary region", async () => {
    render(<Harness open onClose={() => {}} />);
    expect(await screen.findByRole("complementary", { name: "Task" })).toBeTruthy();
  });

  it("closes on Escape by calling the feature's own onClose", async () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    await screen.findByText("panel body");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("defers Escape to whatever handled it first", async () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);
    await screen.findByText("panel body");

    act(() => {
      const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
      event.preventDefault();
      window.dispatchEvent(event);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("gives the slot back when the feature closes it", async () => {
    const { rerender } = render(<Harness open onClose={() => {}} />);
    await screen.findByText("panel body");

    rerender(<Harness open={false} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.queryByText("panel body")).toBeNull();
    });
  });
});
