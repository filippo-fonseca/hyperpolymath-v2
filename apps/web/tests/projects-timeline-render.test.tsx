/**
 * @vitest-environment jsdom
 *
 * Projects timeline render contract (u3-timeline-core / sesh-1784257742502).
 *
 * Why this test exists: the timeline's visible promises are all conditional —
 * ghosts appear only behind show-archived, area headers disappear at
 * scope="area" (u5's reuse), the today marker hides when today falls outside
 * the window, and a label too wide for its bar has to escape the bar. Each is a
 * branch that silently regresses to "looks fine, says nothing".
 *
 * Dates are built relative to the real today via the engine's own ISO helpers,
 * so this stays green tomorrow and in every timezone.
 */

import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ProjectsTimeline } from "@/components/projects/timeline/ProjectsTimeline";
import { labelFitsInsideBar } from "@/components/projects/timeline/TimelineBar";
import { todayISODate } from "@/lib/projects/archive-status";
import { addDaysISO, type TimelineAreaInput, type TimelineProjectInput } from "@/lib/projects/timeline";

vi.mock("@/app/actions/projects", () => ({
  updateProject: vi.fn(async () => ({ success: true, data: null })),
  getProjectsForCurrentUser: vi.fn(async () => []),
}));

beforeAll(() => {
  // jsdom ships neither, and the scroller's scroll-to-today needs both.
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const TODAY = todayISODate();

const AREAS: TimelineAreaInput[] = [
  { id: "area-1", name: "Academics", emoji: "🏛", orderIndex: 0, createdAt: "2026-01-01" },
  { id: "area-2", name: "Fitness", emoji: "💪", orderIndex: 1, createdAt: "2026-01-02" },
];

function project(overrides: Partial<TimelineProjectInput> & { id: string }): TimelineProjectInput {
  return {
    name: `Project ${overrides.id}`,
    icon: null,
    areaId: "area-1",
    startDate: addDaysISO(TODAY, -5),
    endDate: addDaysISO(TODAY, 20),
    createdAt: "2026-01-01",
    archivedAt: null,
    isClass: false,
    semesterTerm: null,
    semesterYear: null,
    orderIndex: 0,
    ...overrides,
  };
}

function renderTimeline(props: Partial<Parameters<typeof ProjectsTimeline>[0]> = {}) {
  return render(
    <ProjectsTimeline
      areas={AREAS}
      projects={[project({ id: "p1" })]}
      showArchived={false}
      scope="all"
      {...props}
    />,
  );
}

describe("ProjectsTimeline", () => {
  it("renders one group per area, with the area name and project count", () => {
    renderTimeline({
      projects: [project({ id: "p1" }), project({ id: "p2" }), project({ id: "p3", areaId: "area-2" })],
    });

    expect(screen.getAllByTestId("timeline-group")).toHaveLength(2);
    expect(screen.getByText("Academics")).toBeInTheDocument();
    expect(screen.getByText("Fitness")).toBeInTheDocument();
    expect(screen.getByText("2 projects")).toBeInTheDocument();
    expect(screen.getByText("1 project")).toBeInTheDocument();
  });

  it("suppresses area headers at scope='area' — u5's reuse", () => {
    renderTimeline({ scope: "area" });

    expect(screen.queryByText("Academics")).not.toBeInTheDocument();
    // The lane itself still renders; only the label row is gone.
    expect(screen.getAllByTestId("timeline-row")).toHaveLength(1);
  });

  it("hides expired projects until show-archived, then renders them as ghosts", () => {
    const expired = project({ id: "old", startDate: addDaysISO(TODAY, -40), endDate: addDaysISO(TODAY, -10) });

    const { unmount } = renderTimeline({ projects: [project({ id: "live" }), expired] });
    expect(screen.getAllByTestId("timeline-row")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Project old" })).not.toBeInTheDocument();
    unmount();

    renderTimeline({ projects: [project({ id: "live" }), expired], showArchived: true });
    expect(screen.getAllByTestId("timeline-row")).toHaveLength(2);
    const ghost = screen.getByRole("button", { name: "Project old" });
    expect(ghost).toHaveAttribute("data-ghost", "true");
    expect(screen.getByRole("button", { name: "Project live" })).not.toHaveAttribute("data-ghost");
  });

  it("marks an end-less project's bar as open-ended", () => {
    renderTimeline({ projects: [project({ id: "p1", endDate: null })] });

    expect(screen.getByRole("button", { name: "Project p1" })).toHaveAttribute("data-open-ended", "true");
  });

  it("renders the today marker when today is inside the window", () => {
    renderTimeline();
    expect(screen.getByTestId("timeline-today-marker")).toBeInTheDocument();
  });

  it("renders an empty state when there are no areas", () => {
    renderTimeline({ areas: [], projects: [] });

    expect(screen.getByText("No areas yet")).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-scroller")).not.toBeInTheDocument();
  });

  it("explains an all-archived board rather than rendering a blank canvas", () => {
    renderTimeline({
      projects: [project({ id: "old", startDate: addDaysISO(TODAY, -40), endDate: addDaysISO(TODAY, -10) })],
      showArchived: false,
    });

    expect(screen.getByText("No active projects")).toBeInTheDocument();
    expect(screen.getByText(/Show archived to see them/)).toBeInTheDocument();
  });

  it("renders both header tiers", () => {
    renderTimeline();
    expect(screen.getByTestId("timeline-header-major")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-header-minor")).toBeInTheDocument();
  });
});

describe("labelFitsInsideBar", () => {
  it("keeps a label inside a bar with room to spare", () => {
    expect(labelFitsInsideBar("Thesis", 200)).toBe(true);
  });

  it("pushes a label outside a bar too narrow to hold it", () => {
    // A 1-day bar at quarters zoom is ~8px — nothing fits.
    expect(labelFitsInsideBar("Thesis", 8)).toBe(false);
    expect(labelFitsInsideBar("Organic Chemistry II", 60)).toBe(false);
  });

  it("scales with label length rather than a fixed threshold", () => {
    expect(labelFitsInsideBar("AB", 60)).toBe(true);
    expect(labelFitsInsideBar("A very long project name indeed", 60)).toBe(false);
  });
});
