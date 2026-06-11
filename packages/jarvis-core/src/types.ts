// Public domain types for @hyperpolymath/jarvis-core.
// These are the contracts every consumer (web app, future CLI) targets.
//
// CRITICAL: task `status` literals use SPACES (not underscores) to match the
// Postgres `task_status` enum at apps/web/lib/db/enums.ts:7-13.

export type ActionType = "create_task" | "create_capture" | "create_event";

// Phase 16: JarvisToolName — canonical union of all tool names across
// create / update / delete / find / utility. Used by ActionExecutor, ScrollbackAction,
// and tool-dispatch switch statements so every consumer references one source of truth.
export type JarvisToolName =
  | "create_task" | "create_capture" | "create_event"
  | "remember_fact" | "ask_clarification"
  | "update_task" | "delete_task"
  | "update_capture" | "delete_capture"
  | "update_event" | "delete_event"
  | "find_tasks" | "find_captures" | "find_events";

export interface ParsedDate {
  /** Original phrase, e.g. "tomorrow 3am". */
  text: string;
  /** ISO 8601 UTC. */
  start: string;
  end?: string;
  allDay?: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  icon?: string | null;
}

export type Priority = "P∞" | "P1" | "P2" | "P3";

export type TaskStatus =
  | "not started"
  | "up next"
  | "in progress"
  | "almost done"
  | "lesno";

export interface CreateTaskAction {
  title: string;
  priority?: Priority;
  status?: TaskStatus;
  /** ISO 8601 UTC. */
  due?: string;
  project_ids?: string[];
  /** Phase 7 forward-compat — populated only when voiceActive=true. */
  voice_summary?: string;
}

export interface CreateCaptureAction {
  content: string;
  hashtags?: string[];
  project_ids?: string[];
  voice_summary?: string;
}

export interface CreateEventAction {
  title: string;
  calendar_id?: string;
  /** ISO 8601 UTC. */
  start: string;
  end: string;
  description?: string;
  voice_summary?: string;
}

export type JarvisTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

// Phase 5.1 (D-M1 / D-M2 / JARVIS-18) — JarvisFact injected into the cached
// system prompt via buildFactsBlock. Does NOT expose id / created_at / source
// to the model — those are server-side only.
export interface JarvisFact {
  type: "preference" | "rule" | "entity" | "workflow";
  key: string;
  value: string;
}

// RememberFactAction is the parsed wire shape from the Anthropic tool call.
// Includes `source` (unlike JarvisFact) so the executor can write it to the DB.
export interface RememberFactAction {
  type: "preference" | "rule" | "entity" | "workflow";
  key: string;
  value: string;
  source: "user_explicit" | "jarvis_suggested";
}

// ---------------------------------------------------------------------------
// Phase 16 — CRUD update / delete / find action input types.
// Mirrors the CreateTask/Capture/Event shapes but for update/delete semantics.
// ---------------------------------------------------------------------------

export interface UpdateTaskAction {
  id: string;
  title?: string | null;
  description?: string | null;
  priority?: "P∞" | "P1" | "P2" | "P3" | null;
  status?: "not started" | "up next" | "in progress" | "almost done" | "lesno" | null;
  due?: string | null;
  project_ids?: string[] | null;
}

export interface DeleteTaskAction {
  id: string;
}

export interface UpdateCaptureAction {
  id: string;
  content?: string | null;
  hashtags?: string[] | null;
  project_ids?: string[] | null;
}

export interface DeleteCaptureAction {
  id: string;
}

export interface UpdateEventAction {
  id: string;
  calendar_id: string;
  title?: string | null;
  description?: string | null;
  start?: string | null;
  end?: string | null;
}

export interface DeleteEventAction {
  id: string;
  calendar_id: string;
}

export interface FindTasksAction {
  query?: string | null;
  status?: Array<"not started" | "up next" | "in progress" | "almost done" | "lesno"> | null;
  priority?: Array<"P∞" | "P1" | "P2" | "P3"> | null;
  project_id?: string | null;
}

export interface FindCapturesAction {
  query?: string | null;
  hashtag?: string | null;
  project_id?: string | null;
  /** ISO date */
  since?: string | null;
}

export interface FindEventsAction {
  query?: string | null;
  /** ISO datetime */
  time_min?: string | null;
  /** ISO datetime */
  time_max?: string | null;
}

// Phase 16 — SessionEntity: tracks entities touched during this JARVIS turn
// for the in-turn scratchpad block (enables update/delete to reference items
// created earlier in the same session without a separate find call).
export interface SessionEntity {
  id: string;
  type: "task" | "capture" | "event";
  title?: string;
  content?: string;
  action: "created" | "updated" | "deleted";
  /** ISO 8601 UTC */
  timestamp: string;
}
