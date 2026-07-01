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

// Issue #165 — Notion-style custom fields on wiki pages. A page_field_definition
// carries one of these types; select supports single- or multi-value ("tags")
// via the allow_multiple flag on the definition.
export const pageFieldTypeEnum = pgEnum("page_field_type", [
  "text",
  "number",
  "date",
  "select",
  "checkbox",
]);

// Issue #165 — a field definition is either wiki-wide (applies to every page) or
// folder-scoped (defined on a top-level folder; cascades to all its descendant
// pages). Folder-scoped defs carry a folder_id.
export const pageFieldScopeEnum = pgEnum("page_field_scope", ["wiki", "folder"]);
