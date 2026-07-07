/**
 * Shared test fixtures for the U-04 data-bridge suites. Not a test file (no
 * `.test.ts` suffix) so vitest does not execute it directly.
 */
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { SidebarArea, SidebarProject } from "@/lib/db/queries/sidebar";

let taskSeq = 0;

/** Fill the full `TaskWithProjects` shape (tasks.ts:14-37); override as needed. */
export function mkTask(over: Partial<TaskWithProjects> = {}): TaskWithProjects {
  return {
    id: `t${++taskSeq}`,
    title: "Task",
    notes: null,
    priority: "P3",
    status: "not started",
    dueDate: null,
    kanbanPosition: 0,
    completedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    url: null,
    recurrence: null,
    projects: [],
    hashtags: [],
    people: [],
    peopleDerivedAt: null,
    ...over,
  };
}

export function mkProject(over: Partial<SidebarProject> = {}): SidebarProject {
  return {
    id: "p",
    name: "Project",
    icon: null,
    orderIndex: 0,
    isClass: false,
    archivedAt: null,
    ...over,
  };
}

export function mkArea(over: Partial<SidebarArea> = {}): SidebarArea {
  return {
    id: "a",
    name: "Area",
    emoji: null,
    orderIndex: 0,
    archivedAt: null,
    projects: [],
    ...over,
  };
}
