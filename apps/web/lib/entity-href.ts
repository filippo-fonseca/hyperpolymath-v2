import type { JarvisToolName } from "@hyperpolymath/jarvis-core";

/**
 * Single source of truth mapping any app entity to its canonical detail URL.
 *
 * Consumed by global search (lib/search.ts) and JARVIS action receipts so that
 * "click an entity, land on it" behaves identically everywhere. When a new
 * entity gains a detail surface, add it here once and every click-through
 * surface inherits it.
 *
 * Detail surfaces:
 *   task    → /tasks?task=<id>        (TasksClient nuqs "task")
 *   capture → /captures?capture=<id>  (CapturesClient nuqs "capture")
 *   person  → /people?person=<id>     (PeopleClient nuqs "person")
 *   project → /projects/<id>
 *   area    → /areas/<id>
 *   page    → /wiki/<id>
 *   journal → /journaling?date=<YYYY-MM-DD>
 *   event   → /calendar  (events live in Google Calendar; no per-event route)
 *   habit   → /habits    (no per-habit detail surface)
 */
export type EntityRef =
  | { kind: "task"; id: string }
  | { kind: "capture"; id: string }
  | { kind: "person"; id: string }
  | { kind: "project"; id: string }
  | { kind: "area"; id: string }
  | { kind: "page"; id: string }
  | { kind: "habit"; id: string }
  | { kind: "journal"; date: string }
  | { kind: "event"; id?: string };

export function entityHref(ref: EntityRef): string {
  switch (ref.kind) {
    case "task":
      return `/tasks?task=${encodeURIComponent(ref.id)}`;
    case "capture":
      return `/captures?capture=${encodeURIComponent(ref.id)}`;
    case "person":
      return `/people?person=${encodeURIComponent(ref.id)}`;
    case "project":
      return `/projects/${encodeURIComponent(ref.id)}`;
    case "area":
      return `/areas/${encodeURIComponent(ref.id)}`;
    case "page":
      return `/wiki/${encodeURIComponent(ref.id)}`;
    case "journal":
      return `/journaling?date=${encodeURIComponent(ref.date)}`;
    case "event":
      return "/calendar";
    case "habit":
      return "/habits";
  }
}

/**
 * Maps a resolved JARVIS tool result to the single entity it created or
 * affected, or null when there is nothing single to open: deletes (the entity
 * is gone), memory/clarification (no entity), link_people (a relation, not a
 * target), and the multi-result find_* tools (which expose per-row links via
 * `findResultRef` instead).
 */
export function receiptEntityRef(name: JarvisToolName, id: string): EntityRef | null {
  switch (name) {
    case "create_task":
    case "update_task":
      return { kind: "task", id };
    case "create_capture":
    case "update_capture":
      return { kind: "capture", id };
    case "create_event":
    case "update_event":
      return { kind: "event", id };
    case "create_person":
      return { kind: "person", id };
    default:
      return null;
  }
}

/**
 * For a find_* tool, maps one matched row's id to its entity URL so each result
 * row in the receipt is individually clickable. Returns null for tools that
 * aren't find_* or rows without an id.
 */
export function findResultRef(name: JarvisToolName, id: string): EntityRef | null {
  switch (name) {
    case "find_tasks":
      return { kind: "task", id };
    case "find_captures":
      return { kind: "capture", id };
    case "find_events":
      return { kind: "event", id };
    case "find_people":
      return { kind: "person", id };
    default:
      return null;
  }
}
