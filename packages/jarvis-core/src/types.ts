// Public domain types for @hyperpolymath/jarvis-core.
// These are the contracts every consumer (web app, future CLI) targets.
//
// CRITICAL: task `status` literals use SPACES (not underscores) to match the
// Postgres `task_status` enum at apps/web/lib/db/enums.ts:7-13.

export type ActionType = "create_task" | "create_capture" | "create_event";

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
