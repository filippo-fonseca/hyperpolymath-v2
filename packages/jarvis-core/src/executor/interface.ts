// ActionExecutor interface — implementations live in the consumer (web app
// wires Drizzle + googleapis; future CLI wires its own executor).
//
// SECURITY (D-15 / JARVIS-12): `userId` MUST be re-derived from
// `supabase.auth.getClaims()` at the route-handler boundary. The model
// NEVER emits a userId; trusting one from the model is a vulnerability.

import type {
  CreateCaptureAction,
  CreateEventAction,
  CreateTaskAction,
  DeleteCaptureAction,
  DeleteEventAction,
  DeleteTaskAction,
  FindCapturesAction,
  FindEventsAction,
  FindTasksAction,
  RememberFactAction,
  UpdateCaptureAction,
  UpdateEventAction,
  UpdateTaskAction,
} from "../types";
import type { AskClarificationAction } from "../tools/ask-clarification";

export interface ExecutionContext {
  /** Re-derived from getClaims() at the boundary, NEVER trusted from model. */
  userId: string;
  /**
   * Capture provenance — where this turn originated. `device` is the paired
   * token's name ('Web' for the browser console), denormalized into created
   * rows so the record survives token deletion. Optional for back-compat.
   */
  source?: { device: string; input: "voice" | "text" };
  /** IANA timezone. */
  userTimezone: string;
  defaultCalendarId: string | null;
  /**
   * Phase 5.1 D-P2 #3 / JARVIS-21 — pre-validated project IDs from the turn
   * boundary. When present, executors short-circuit their own validateProjectIds
   * call for any project_id that is already in this set, avoiding duplicate
   * SELECTs on multi-action turns that reference the same project.
   *
   * Optional — backward-compatible. Executors MUST fall back to full validation
   * if this field is absent (e.g. tests that don't wire the route).
   */
  preValidatedProjectIds?: Set<string>;
}

export type ExecutorResult =
  | { ok: true; id: string; receipt: Record<string, unknown> }
  | {
      ok: false;
      error: string;
      kind?: "validation" | "auth" | "network" | "revoked" | "not_found" | "not_connected" | "internal";
    };

export interface ActionExecutor {
  createTask(
    input: CreateTaskAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;
  createCapture(
    input: CreateCaptureAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;
  createEvent(
    input: CreateEventAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;
  /** Phase 5.1 (D-M5 / JARVIS-18): persist a user fact via onConflictDoUpdate. */
  rememberFact(
    input: RememberFactAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;
  /**
   * Phase 5.1 (D-A1 / JARVIS-19): ask a clarifying question. No-op on the server —
   * the question payload is streamed via event: clarification SSE BEFORE this runs.
   * Returns an ok receipt for uniform dispatch-loop handling.
   */
  askClarification(
    input: AskClarificationAction,
    ctx: ExecutionContext,
  ): Promise<ExecutorResult>;

  // Phase 16 — CRUD update / delete / find methods.
  // Implementations land in Plan 16-03; declaring here first so Plans 16-02,
  // 16-04, and 16-05 can import against a stable interface.
  updateTask(input: UpdateTaskAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  deleteTask(input: DeleteTaskAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  updateCapture(input: UpdateCaptureAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  deleteCapture(input: DeleteCaptureAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  updateEvent(input: UpdateEventAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  deleteEvent(input: DeleteEventAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  findTasks(input: FindTasksAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  findCaptures(input: FindCapturesAction, ctx: ExecutionContext): Promise<ExecutorResult>;
  findEvents(input: FindEventsAction, ctx: ExecutionContext): Promise<ExecutorResult>;
}
