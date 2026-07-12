/**
 * Life OS command-center regression guards.
 *
 * The page's server data and realtime boundaries are intentionally frozen, so
 * these tests keep the contracts close to the owned UI without constructing a
 * database-backed route. The small Quick Send render verifies the handoff at
 * runtime; source assertions cover the exact keys and static motion gates.
 */

import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/components/jarvis/LiteJarvisComposer", () => ({
  LiteJarvisComposer: ({ onSubmit }: { onSubmit: (text: string) => void }) => (
    <button type="button" onClick={() => onSubmit("capture this thought")}>
      submit quick send
    </button>
  ),
}));

import { LifeOsQuickSend } from "@/components/lifeos/LifeOsQuickSend";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("Life OS command center frozen contracts", () => {
  beforeEach(() => {
    pushMock.mockReset();
    window.sessionStorage.clear();
  });

  it("writes jarvis-prefill before routing Quick Send to /today", () => {
    render(<LifeOsQuickSend />);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "submit quick send" }));
    });

    expect(window.sessionStorage.getItem("jarvis-prefill")).toBe("capture this thought");
    expect(pushMock).toHaveBeenCalledWith("/today");
  });

  it("preserves the page data boundary and all five realtime islands", () => {
    const page = source("../app/(app)/lifeos/page.tsx");
    expect(page).toContain('export const dynamic = "force-dynamic"');
    expect(page).toContain("requireOnboarded");
    expect(page).toContain("Promise.all");

    expect(source("../components/lifeos/UpcomingTasksWidget.tsx")).toContain(
      'useTableSubscription("tasks", userId)'
    );
    expect(source("../components/lifeos/TodayHabitsWidget.tsx")).toContain(
      'useTableSubscription("habits", userId)'
    );
    expect(source("../components/lifeos/TodayHabitsWidget.tsx")).toContain(
      'useTableSubscription("habit_completions", userId)'
    );
    expect(source("../components/lifeos/TodayTrainingWidget.tsx")).toContain(
      'useTableSubscription("training_activities", userId)'
    );
    expect(source("../components/lifeos/RecentCapturesWidget.tsx")).toContain(
      'useTableSubscription("captures", userId)'
    );

    expect(source("../components/lifeos/UpcomingTasksWidget.tsx")).toContain(
      'tableKey("tasks", userId)'
    );
    expect(source("../components/lifeos/TodayHabitsWidget.tsx")).toContain(
      'tableKey("habit_completions", userId)'
    );
    expect(source("../components/lifeos/TodayTrainingWidget.tsx")).toContain(
      'tableKey("training_activities", userId)'
    );
    expect(source("../components/lifeos/RecentCapturesWidget.tsx")).toContain(
      '...tableKey("captures", userId), null'
    );
  });

  it("keeps the AreasTree storage namespaces and static reduced-motion branch", () => {
    const tree = source("../components/areas/AreasTree.tsx");
    expect(tree).toContain('"areas-tree-hide-all-projects"');
    expect(tree).toContain('"areas-tree-show-archived"');
    expect(tree).toContain('"areas-tree-collapsed-"');
    expect(tree).toContain("useReducedMotion");
    expect(tree).toContain("reducedMotion ? null");
    expect(tree).toContain('!reducedMotion && "animate-pulse"');
    expect(tree).toContain("<animateMotion");
  });

  it("keeps the bento split container-aware in both motion branches", () => {
    const bento = source("../components/lifeos/LifeOsBentoGrid.tsx");

    expect(bento.match(/@3xl\/main:grid-cols-12/g)).toHaveLength(2);
    expect(bento.match(/@3xl\/main:col-span-8/g)).toHaveLength(2);
    expect(bento.match(/@3xl\/main:col-span-4/g)).toHaveLength(4);
    expect(bento.match(/@3xl\/main:col-span-12/g)).toHaveLength(2);
    expect(bento).not.toContain("lg:grid-cols-12");
    expect(bento).not.toContain("lg:col-span-");
    expect(bento).toContain("grid-cols-1");
  });

  it("restores Life OS section and widget heading relationships", () => {
    const headingContracts = [
      ["../components/lifeos/LifeOsAreasShell.tsx", "lifeos-system-map-title", "h2", "System map"],
      ["../components/lifeos/LifeOsBentoGrid.tsx", "lifeos-today-work-title", "h2", "Today / work"],
      [
        "../components/lifeos/LifeOsInsightsWidget.tsx",
        "lifeos-insights-title",
        "h2",
        "Insights gateway",
      ],
      [
        "../components/lifeos/UpcomingTasksWidget.tsx",
        "lifeos-upcoming-tasks-title",
        "h3",
        "Upcoming tasks",
      ],
      ["../components/lifeos/TodayHabitsWidget.tsx", "lifeos-habits-title", "h3", "Habits today"],
      ["../components/lifeos/TodayTrainingWidget.tsx", "lifeos-training-title", "h3", "Training"],
      [
        "../components/lifeos/RecentCapturesWidget.tsx",
        "lifeos-capture-stream-title",
        "h3",
        "Capture stream",
      ],
    ] as const;

    for (const [relativePath, id, level, title] of headingContracts) {
      const component = source(relativePath);
      expect(component).toContain(`aria-labelledby="${id}"`);
      expect(component).toContain(`<${level} id="${id}" className="sr-only">`);
      expect(component).toContain(title);
    }

    expect(source("../components/lifeos/LifeOsAreasShell.tsx")).toContain("<CollapseChevron");
    expect(source("../components/lifeos/LifeOsBentoGrid.tsx")).toContain("<CollapseChevron");
    expect(source("../components/lifeos/UpcomingTasksWidget.tsx")).toContain("<Link\n");
    expect(source("../components/lifeos/TodayTrainingWidget.tsx")).toContain("<Link\n");
  });

  it("makes capture conversion keyboard-visible and coarse-pointer usable", () => {
    const captures = source("../components/lifeos/RecentCapturesWidget.tsx");
    expect(captures).toContain("focus-visible:outline-none");
    expect(captures).toContain("pointer:fine");
    expect(captures).toContain('createdVia === "jarvis"');
  });
});
