/**
 * @vitest-environment jsdom
 *
 * Area-detail grid|timeline surface (u5-area-detail-timeline / sesh-1784257742502).
 *
 * Why this test exists: u5 wires u3's ProjectsTimeline onto /areas/[areaId] behind
 * a page-scoped toggle, pre-filtered to one area (scope="area", no area header),
 * with the Active/Archived tab as the single archived control across both views.
 * Each of those is a branch that silently regresses. The grid path must also stay
 * exactly as it was. Dates are built relative to the real today via the engine's
 * ISO helpers so this stays green tomorrow and in every timezone.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AreaProjectList, type AreaProject } from "@/components/areas/AreaProjectList";
import { todayISODate } from "@/lib/projects/archive-status";
import { addDaysISO } from "@/lib/projects/timeline";

// The timeline's live query must never resolve here: keeping it pending means the
// bars render from the widened RSC props (the first-paint path u5 relies on), and
// there is no late async state update to fight.
vi.mock("@/app/actions/projects", () => ({
  updateProject: vi.fn(async () => ({ success: true, data: null })),
  getProjectsForCurrentUser: vi.fn(() => new Promise<never>(() => {})),
}));

// Realtime is a side effect we do not exercise here; a no-op keeps supabase out.
vi.mock("@/lib/realtime/useTableSubscription", () => ({
  useTableSubscription: vi.fn(),
}));

// The grid cards' per-card menu reaches for the app router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/areas/area-1",
  useSearchParams: () => new URLSearchParams(),
}));

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const TODAY = todayISODate();

const AREA = {
  id: "area-1",
  name: "Academics",
  emoji: "🏛",
  orderIndex: 0,
  createdAt: "2026-01-01",
};

function project(overrides: Partial<AreaProject> & { id: string }): AreaProject {
  return {
    name: `Project ${overrides.id}`,
    icon: null,
    isClass: false,
    courseCode: null,
    description: null,
    startDate: addDaysISO(TODAY, -5),
    endDate: addDaysISO(TODAY, 20),
    archivedAt: null,
    semesterTerm: null,
    semesterYear: null,
    orderIndex: 0,
    createdAt: "2026-01-01",
    ...overrides,
  };
}

function renderList(projects: AreaProject[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AreaProjectList
        areaId={AREA.id}
        area={AREA}
        userId="user-1"
        projects={projects}
        allAreas={[{ id: AREA.id, name: AREA.name }]}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
});

describe("AreaProjectList — grid | timeline", () => {
  it("defaults to the grid: cards render, the toggle is present, no timeline", () => {
    renderList([project({ id: "p1", name: "Thesis" })]);

    expect(screen.getByTestId("area-detail-view-toggle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Thesis/ })).toBeInTheDocument();
    expect(screen.queryByTestId("timeline-scroller")).not.toBeInTheDocument();
  });

  it("switches to the timeline at scope='area' — bars render, no area header", () => {
    renderList([project({ id: "p1", name: "Thesis" }), project({ id: "p2", name: "Seminar" })]);

    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));

    expect(screen.getByTestId("timeline-scroller")).toBeInTheDocument();
    // Two active projects → two lanes, and no suppressed area-group label.
    expect(screen.getAllByTestId("timeline-row")).toHaveLength(2);
    // scope="area" suppresses the area-group label row.
    expect(screen.queryByText("Academics")).not.toBeInTheDocument();
    // The grid is gone.
    expect(screen.queryByRole("link", { name: /Thesis/ })).not.toBeInTheDocument();
  });

  it("lets the Active/Archived tab govern archived visibility on the timeline", () => {
    renderList([
      project({ id: "live", name: "Live" }),
      project({
        id: "old",
        name: "Old Seminar",
        startDate: addDaysISO(TODAY, -40),
        endDate: addDaysISO(TODAY, -10),
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));

    // Active tab → the expired project is hidden.
    expect(screen.getAllByTestId("timeline-row")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Old Seminar" })).not.toBeInTheDocument();

    // Archived tab → it surfaces as a muted ghost.
    fireEvent.click(screen.getByRole("button", { name: /Archived/ }));
    expect(screen.getAllByTestId("timeline-row")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Old Seminar" })).toHaveAttribute("data-ghost", "true");
  });

  it("keeps the grid empty-state byte-for-byte, and reaches the timeline panel", () => {
    renderList([]);

    // Grid view (default): the original empty copy, unchanged.
    expect(screen.getByText("No projects in this area yet.")).toBeInTheDocument();
    expect(screen.getByTestId("area-detail-view-toggle")).toBeInTheDocument();

    // Timeline view: the ProjectsTimeline empty panel WITH its zoom toolbar.
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    expect(screen.getByText("No active projects")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Months" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
  });

  it("only offers the class filter in the grid view", () => {
    renderList([
      project({ id: "c1", name: "Orgo", isClass: true, courseCode: "CHEM 101" }),
      project({ id: "p1", name: "Thesis" }),
    ]);

    // Grid + active tab with a class present → the hide-classes control shows.
    expect(screen.getByRole("button", { name: /Hide classes/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));
    expect(screen.queryByRole("button", { name: /Hide classes/ })).not.toBeInTheDocument();
  });

  it("shares the zoom key with /areas — Quarters chosen there carries into the detail timeline", () => {
    // The /areas index persists zoom under the SHARED `areas:timeline-zoom` key.
    // ProjectsTimeline reads that same key via useTimelineView, and the page-scoped
    // useAreaDetailView deliberately never touches zoom — so a zoom picked on the
    // index shows up here for free. Seed the shared key as if the user had chosen
    // Quarters on /areas, then open the detail timeline and confirm it carried.
    localStorage.setItem("areas:timeline-zoom", "quarters");

    renderList([project({ id: "p1", name: "Thesis" })]);
    fireEvent.click(screen.getByRole("button", { name: "Timeline" }));

    expect(screen.getByRole("button", { name: "Quarters" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Months" })).toHaveAttribute("aria-pressed", "false");
  });
});
