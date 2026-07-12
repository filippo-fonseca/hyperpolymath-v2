import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AmbientOrb,
  CommandToolbar,
  DeckPanel,
  DenseListRow,
  EmptyState,
  HairlineDivider,
  InspectorShell,
  KpiRail,
  MetaRow,
  MetaSection,
  ModeStrip,
  SectionHeader,
  StatChip,
} from "@/components/spacedrive";

/**
 * Smoke + behavior coverage for the spacedrive/ primitive family (Unit 1).
 * jsdom does not evaluate Tailwind/CSS, so "both themes" here means each
 * primitive renders without error inside AND outside a `.dark` subtree; real
 * visual theming is covered by the signed-in browser pass. The behavioral
 * assertions (DenseListRow keyboard activation, ModeStrip aria-pressed toggles,
 * AmbientOrb static under reduced motion) are the load-bearing part.
 */

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
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

beforeEach(() => {
  stubMatchMedia(false); // default: reduced motion OFF
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("spacedrive primitives — render smoke (both themes)", () => {
  it("DeckPanel renders its children under light and dark subtrees", () => {
    const { rerender } = render(<DeckPanel>panel-body</DeckPanel>);
    expect(screen.getByText("panel-body")).toBeInTheDocument();
    rerender(
      <div className="dark">
        <DeckPanel tone="deep">panel-body</DeckPanel>
      </div>,
    );
    expect(screen.getByText("panel-body")).toBeInTheDocument();
  });

  it("HairlineDivider is a separator with an orientation", () => {
    render(<HairlineDivider orientation="vertical" />);
    const sep = screen.getByRole("separator");
    expect(sep).toHaveAttribute("aria-orientation", "vertical");
  });

  it("SectionHeader renders title (label + eyebrow variants) and action", () => {
    const { rerender } = render(
      <SectionHeader title="Overview" action={<button type="button">act</button>} />,
    );
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "act" })).toBeInTheDocument();
    rerender(<SectionHeader title="Meta" eyebrow />);
    expect(screen.getByText("Meta")).toBeInTheDocument();
  });

  it("EmptyState renders title, description and action", () => {
    render(
      <EmptyState
        title="Nothing here"
        description="Add your first item"
        action={<button type="button">New</button>}
      />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Add your first item")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("CommandToolbar renders leading cluster and action children", () => {
    render(
      <CommandToolbar leading={<span>Title</span>}>
        <button type="button">Primary</button>
      </CommandToolbar>,
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Primary" })).toBeInTheDocument();
  });

  it("KpiRail + StatChip render label, value and a tinted delta", () => {
    render(
      <div className="dark">
        <KpiRail>
          <StatChip label="Focus" value="4h" delta={{ value: "12%", direction: "up" }} />
        </KpiRail>
      </div>,
    );
    expect(screen.getByText("Focus")).toBeInTheDocument();
    expect(screen.getByText("4h")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
  });

  it("InspectorShell with MetaSection / MetaRow renders labels and values", () => {
    render(
      <InspectorShell title="Details">
        <MetaSection label="Meta">
          <MetaRow label="Created" value="Today" />
        </MetaSection>
      </InspectorShell>,
    );
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Meta")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });
});

describe("ModeStrip — aria-pressed toggle contract", () => {
  const modes = [
    { value: "grid", label: "Grid" },
    { value: "list", label: "List" },
  ];

  it("marks the active mode aria-pressed and reports changes", () => {
    const onChange = vi.fn();
    render(<ModeStrip modes={modes} value="grid" onChange={onChange} ariaLabel="View mode" />);

    const group = screen.getByRole("group", { name: "View mode" });
    const grid = within(group).getByRole("button", { name: "Grid" });
    const list = within(group).getByRole("button", { name: "List" });

    expect(grid).toHaveAttribute("aria-pressed", "true");
    expect(list).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(list);
    expect(onChange).toHaveBeenCalledWith("list");
  });
});

describe("DenseListRow — keyboard activation", () => {
  it("activates on click, Enter and Space when interactive", () => {
    const onActivate = vi.fn();
    render(<DenseListRow title="Row one" onActivate={onActivate} selected />);

    const row = screen.getByRole("button", { name: /Row one/ });
    expect(row).toHaveAttribute("tabindex", "0");
    expect(row).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(row);
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.keyDown(row, { key: " " });

    expect(onActivate).toHaveBeenCalledTimes(3);
  });

  it("is inert (no button role) without onActivate", () => {
    render(<DenseListRow title="Static row" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Static row")).toBeInTheDocument();
  });
});

describe("AmbientOrb — reduced motion", () => {
  it("renders a static frame (aria-hidden, opacity ceiling) when reduced motion is on", () => {
    stubMatchMedia(true); // reduced motion ON
    render(<AmbientOrb intensity={0.5} />);
    const orb = screen.getByTestId("ambient-orb");
    expect(orb).toHaveAttribute("aria-hidden", "true");
    // Static branch pins opacity to the intensity ceiling (no animation).
    expect(orb.style.opacity).toBe("0.5");
  });

  it("still renders the orb element when motion is allowed", () => {
    render(<AmbientOrb />);
    expect(screen.getByTestId("ambient-orb")).toBeInTheDocument();
  });
});
