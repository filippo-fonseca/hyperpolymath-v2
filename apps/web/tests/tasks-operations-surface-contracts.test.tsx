import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { fromYmd } from "@/lib/tasks/date-shortcuts";

const webRoot = process.cwd();

function source(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), "utf8");
}

describe("tasks operations contracts", () => {
  it("parses YMD values at local midnight", () => {
    const date = fromYmd("2026-07-12");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(12);
    expect(date.getHours()).toBe(0);
  });

  it("guards every owned motion surface with reduced-motion support", () => {
    const motionSurfaces = [
      "components/tasks/TaskCard.tsx",
      "components/tasks/TaskList.tsx",
      "components/tasks/TaskListRow.tsx",
      "components/tasks/KanbanBoard.tsx",
      "components/tasks/KanbanColumn.tsx",
      "components/tasks/TaskOverviewView.tsx",
      "components/tasks/OverdueTasksPanel.tsx",
      "components/tasks/TaskSelectionBar.tsx",
      "components/tasks/TaskCreateInline.tsx",
      "components/tasks/TaskDetailPanel.tsx",
    ];

    for (const path of motionSurfaces) {
      expect(source(path), path).toContain("useReducedMotion");
    }
  });

  it("keeps task URL, storage, realtime, and local-date markers in the state boundary", () => {
    const client = source("components/tasks/TasksClient.tsx");
    const storageSources =
      client +
      source("components/tasks/KanbanBoard.tsx") +
      source("components/tasks/OverdueTasksPanel.tsx") +
      source("lib/ui/useTasksExpanded.ts");
    for (const param of ["view", "date", "task", "create", "priority", "status", "due", "project"]) {
      expect(client).toMatch(new RegExp(`(?:[\\\"']${param}[\\\"']|${param}:)`));
    }
    for (const key of [
      "tasks-view",
      "tasks-show-lesno",
      "tasks-inbox-hidden",
      "tasks-tray-expanded",
      "tasks-card-fields",
      "tasks-overdue-panel-open",
      "tasks-overdue-collapsed-groups",
    ]) {
      expect(storageSources).toContain(key);
    }
    expect(client).toContain('tableKey("tasks", userId)');
    expect(client).toContain('useTableSubscription("tasks", userId)');
    expect(client).toContain('useTableSubscription("tasks_projects", userId)');
    expect(client).toContain("fromYmd");
    expect(client).toContain("t.dueDate === dateYmd");
  });
});
