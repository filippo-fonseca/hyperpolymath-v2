/**
 * @vitest-environment jsdom
 *
 * Timeline date edits: the archive trap and the undo path
 * (u3-timeline-core / sesh-1784257742502).
 *
 * Why this test exists: an end_date in the past makes a project count as
 * archived everywhere — sidebar, /areas, /lifeos — even with archived_at IS
 * NULL (Issue #55). That makes "Save" a destructive button wearing an
 * innocuous label, and the only thing standing between the user and a project
 * vanishing is the confirm step this file pins.
 *
 * It also pins the undo contract, which is deferred-commit: the write fires
 * when the toast closes, and Undo means it never fires at all. A regression
 * that writes eagerly would still LOOK correct — the toast would appear, the
 * bar would move — while quietly making Undo a lie.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectsTimeline } from "@/components/projects/timeline/ProjectsTimeline";
import { todayISODate } from "@/lib/projects/archive-status";
import { addDaysISO, type TimelineAreaInput, type TimelineProjectInput } from "@/lib/projects/timeline";

const updateProject = vi.fn(async (_input: unknown) => ({ success: true, data: null }));
vi.mock("@/app/actions/projects", () => ({
  updateProject: (input: unknown) => updateProject(input),
  getProjectsForCurrentUser: vi.fn(async () => []),
}));

interface CapturedToast {
  message: string;
  opts: {
    action: { label: string; onClick: () => void };
    onAutoClose: () => void;
    onDismiss: () => void;
  };
}
const toasts: CapturedToast[] = [];
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: Object.assign(
    (message: string, opts: CapturedToast["opts"]) => {
      toasts.push({ message, opts });
    },
    { error: (m: string) => toastError(m) },
  ),
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

beforeEach(() => {
  toasts.length = 0;
  updateProject.mockClear();
  toastError.mockClear();
  localStorage.clear();
});

const TODAY = todayISODate();
/**
 * A past end date that still sits AFTER the project's start — otherwise the
 * inversion guard fires first and the trap never gets a turn.
 */
const PAST = addDaysISO(TODAY, -30);
const FUTURE = addDaysISO(TODAY, 30);

const AREAS: TimelineAreaInput[] = [
  { id: "area-1", name: "Academics", emoji: "🏛", orderIndex: 0, createdAt: "2026-01-01" },
];

const PROJECT: TimelineProjectInput = {
  id: "p1",
  name: "Thesis",
  icon: null,
  areaId: "area-1",
  startDate: addDaysISO(TODAY, -60),
  endDate: FUTURE,
  createdAt: "2026-01-01",
  archivedAt: null,
  isClass: false,
  semesterTerm: null,
  semesterYear: null,
  orderIndex: 0,
};

function renderTimeline(projects: TimelineProjectInput[] = [PROJECT]) {
  return render(
    <ProjectsTimeline areas={AREAS} projects={projects} showArchived scope="all" />,
  );
}

function openPopover(name = "Thesis") {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.findByTestId("timeline-bar-popover");
}

describe("timeline date editing", () => {
  it("opens a popover on the bar with a link to the project", async () => {
    renderTimeline();
    await openPopover();

    expect(screen.getByRole("link", { name: /Thesis/ })).toHaveAttribute("href", "/projects/p1");
  });

  it("warns before an edit that would archive the project, and does not write until confirmed", async () => {
    renderTimeline();
    await openPopover();

    fireEvent.change(screen.getByTestId("timeline-end-input"), { target: { value: PAST } });
    fireEvent.click(screen.getByTestId("timeline-save-dates"));

    // The warning replaces Save — the user cannot fall through to a write.
    expect(screen.getByTestId("timeline-archive-warning")).toBeInTheDocument();
    expect(screen.getByText(/disappears from the sidebar/)).toBeInTheDocument();
    expect(toasts).toHaveLength(0);
    expect(updateProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("timeline-archive-confirm"));
    expect(toasts).toHaveLength(1);
  });

  it("backs out of the trap without writing when the warning is cancelled", async () => {
    renderTimeline();
    await openPopover();

    fireEvent.change(screen.getByTestId("timeline-end-input"), { target: { value: PAST } });
    fireEvent.click(screen.getByTestId("timeline-save-dates"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByTestId("timeline-archive-warning")).not.toBeInTheDocument();
    expect(toasts).toHaveLength(0);
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("does not warn for an edit that leaves the project in the future", async () => {
    renderTimeline();
    await openPopover();

    fireEvent.change(screen.getByTestId("timeline-end-input"), { target: { value: addDaysISO(TODAY, 60) } });
    fireEvent.click(screen.getByTestId("timeline-save-dates"));

    expect(screen.queryByTestId("timeline-archive-warning")).not.toBeInTheDocument();
    expect(toasts).toHaveLength(1);
  });

  it("commits through updateProject only once the undo toast closes", async () => {
    renderTimeline();
    await openPopover();

    const nextEnd = addDaysISO(TODAY, 60);
    fireEvent.change(screen.getByTestId("timeline-end-input"), { target: { value: nextEnd } });
    fireEvent.click(screen.getByTestId("timeline-save-dates"));

    expect(toasts[0].message).toContain("Thesis");
    // Deferred: nothing has been written yet.
    expect(updateProject).not.toHaveBeenCalled();

    toasts[0].opts.onAutoClose();

    await waitFor(() => expect(updateProject).toHaveBeenCalledTimes(1));
    expect(updateProject).toHaveBeenCalledWith({
      id: "p1",
      startDate: PROJECT.startDate,
      endDate: nextEnd,
    });
  });

  it("never writes when the edit is undone", async () => {
    renderTimeline();
    await openPopover();

    fireEvent.change(screen.getByTestId("timeline-end-input"), { target: { value: addDaysISO(TODAY, 60) } });
    fireEvent.click(screen.getByTestId("timeline-save-dates"));

    toasts[0].opts.action.onClick();

    expect(updateProject).not.toHaveBeenCalled();
    expect(toasts[0].opts.action.label).toBe("Undo");
  });

  it("blocks a save whose end date precedes its start date", async () => {
    renderTimeline();
    await openPopover();

    fireEvent.change(screen.getByTestId("timeline-start-input"), { target: { value: addDaysISO(TODAY, 10) } });
    fireEvent.change(screen.getByTestId("timeline-end-input"), { target: { value: addDaysISO(TODAY, 5) } });

    expect(screen.getByTestId("timeline-inverted-warning")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-save-dates")).toBeDisabled();

    fireEvent.click(screen.getByTestId("timeline-save-dates"));
    expect(toasts).toHaveLength(0);
  });

  it("clearing the end date is an open-ended project, not an archived one", async () => {
    renderTimeline();
    await openPopover();

    fireEvent.change(screen.getByTestId("timeline-end-input"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("timeline-save-dates"));

    expect(screen.queryByTestId("timeline-archive-warning")).not.toBeInTheDocument();
    toasts[0].opts.onAutoClose();

    await waitFor(() => expect(updateProject).toHaveBeenCalledWith({
      id: "p1",
      startDate: PROJECT.startDate,
      endDate: null,
    }));
  });
});
