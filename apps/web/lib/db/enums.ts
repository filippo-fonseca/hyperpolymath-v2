import { pgEnum } from "drizzle-orm/pg-core";

// PRESERVED LITERALS (HANDOFF.md §18 non-negotiables): "P∞" and "lesno"
// Postgres enums accept Unicode; the P∞ literal stores as-is.
export const priorityEnum = pgEnum("priority", ["P∞", "P1", "P2", "P3"]);

export const taskStatusEnum = pgEnum("task_status", [
  "not started",
  "up next",
  "in progress",
  "almost done",
  "lesno",
]);

export const semesterTermEnum = pgEnum("semester_term", ["fall", "spring", "summer"]);
