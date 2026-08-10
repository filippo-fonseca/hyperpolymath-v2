// Table → query-key invalidation map. Fired by JARVIS tool-call SSE events
// (a turn that created a task must refresh the tasks tab instantly) and by
// the realtime channels. Coarse by design: invalidate-only, never merge.

import { queryClient } from "./queryClient";
import { queryKeys } from "./queryKeys";

export type InvalidatableTable =
  | "tasks"
  | "captures"
  | "habits"
  | "habit_completions"
  | "pages"
  | "page_folders"
  | "projects"
  | "calendar";

const KEY_MAP: Record<InvalidatableTable, readonly (readonly string[])[]> = {
  tasks: [queryKeys.tasks],
  captures: [queryKeys.captures],
  habits: [queryKeys.habitsAll],
  habit_completions: [queryKeys.habitsAll],
  pages: [queryKeys.wikiAll],
  page_folders: [queryKeys.wikiAll],
  projects: [queryKeys.projects],
  calendar: [queryKeys.calendar],
};

export function invalidateTable(table: InvalidatableTable): void {
  for (const key of KEY_MAP[table]) {
    void queryClient.invalidateQueries({ queryKey: key as unknown as string[] });
  }
}

/** Map a JARVIS tool name to the tables it touches, then invalidate. */
export function invalidateForToolCall(toolName: string): void {
  const name = toolName.toLowerCase();
  if (name.includes("task")) invalidateTable("tasks");
  if (name.includes("capture")) invalidateTable("captures");
  if (name.includes("habit")) invalidateTable("habits");
  if (name.includes("page") || name.includes("wiki") || name.includes("daily")) {
    invalidateTable("pages");
  }
  if (name.includes("event") || name.includes("calendar")) {
    invalidateTable("calendar");
  }
  if (name.includes("project") || name.includes("area")) {
    invalidateTable("projects");
  }
}
