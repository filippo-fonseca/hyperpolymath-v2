/**
 * Shared task-status presentation constants. Kept in a leaf module (no React,
 * no editor imports) so the board bundle never pulls the detail panel's TipTap
 * stack just to colour a dot.
 */

export type TaskStatus = "not started" | "up next" | "in progress" | "almost done" | "lesno";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  "not started": "Not started",
  "up next": "Up next",
  "in progress": "In progress",
  "almost done": "Almost done",
  lesno: "Lesno",
};

/**
 * Per-status functional ink. Token-only (SDC-1 §2.3): functional hues appear
 * as 6px dots and 12%-alpha chips, never as chrome. The detail panel's status
 * pills and the kanban column headers share these exact values.
 */
export const STATUS_DOT: Record<TaskStatus, string> = {
  "not started": "var(--ink-faint)",
  "up next": "var(--ink-amber)",
  "in progress": "var(--ink-blue)",
  "almost done": "var(--ink-violet)",
  lesno: "var(--ink-sage)",
};

/**
 * Per-status craft tint class (jul-29 craft restyle). Sets the generic
 * --tint-bg / --tint-edge / --tint-ink triple on the column so its well,
 * hairline and header pick up the pastel identity. Hues track STATUS_DOT
 * (amber→butter, blue→sky, violet→lavender, sage→sage); "not started"
 * stays neutral and falls back to the plain surface.
 */
export const STATUS_TINT: Record<TaskStatus, string | null> = {
  "not started": null,
  "up next": "tint-butter",
  "in progress": "tint-sky",
  "almost done": "tint-lavender",
  lesno: "tint-sage",
};
