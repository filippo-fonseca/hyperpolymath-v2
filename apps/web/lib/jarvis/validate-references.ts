/**
 * Server-side ID re-validation for JARVIS-12 / JARVIS-14.
 *
 * The agent emits project_id / calendar_id values it has resolved from
 * the user's prompt + context. We NEVER trust those IDs end-to-end — at
 * the executor boundary we re-derive ownership against the DB:
 *
 *   - validateProjectIds(userId, ids) verifies every id belongs to a
 *     project where projects.user_id = userId. A model emitting another
 *     user's project_id is treated as a validation error (no DB write).
 *
 *   - validateCalendarId(userId, calendarId) verifies the calendar is
 *     either the user's default, in their visible-calendars list, or the
 *     literal "primary". Anything else → rejected (no gcal call).
 *
 * Both helpers short-circuit BEFORE the executor performs any mutating
 * call. They are the load-bearing defense against cross-tenant data
 * tampering via prompt injection.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";

export interface ValidateProjectsResult {
  ok: boolean;
  ids: string[];
  rejected: string[];
}

export async function validateProjectIds(
  userId: string,
  projectIds: string[] | undefined,
): Promise<ValidateProjectsResult> {
  if (!projectIds || projectIds.length === 0) {
    return { ok: true, ids: [], rejected: [] };
  }
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.userId, userId), inArray(projects.id, projectIds)));
  const found = new Set(rows.map((r) => r.id));
  const rejected = projectIds.filter((id) => !found.has(id));
  return { ok: rejected.length === 0, ids: Array.from(found), rejected };
}

export interface ValidateCalendarResult {
  ok: boolean;
  calendarId: string | null;
}

/**
 * Phase 5.1 D-P2 #3 / JARVIS-21 — batched reference validation for one
 * JARVIS turn.
 *
 * Pre-resolves at the route boundary BEFORE executor dispatch so that:
 *   1. Multi-action turns referencing the same project don't fire duplicate
 *      SELECTs — a single project query covers all actions in the turn.
 *   2. Project + calendar queries are dispatched concurrently via Promise.all
 *      (one "round-trip" for both), keeping total DB roundtrips per turn ≤ 2.
 *
 * Callers pass all project IDs referenced across ALL actions in the turn.
 * Duplicate IDs are deduplicated before the SELECT (Pitfall 5 guard).
 *
 * For the per-turn budget:
 *   Round-trip 1: validateTurnReferences (project SELECT + calendar SELECT, concurrent)
 *   Round-trip 2: executor write (db.transaction with all inserts)
 *
 * Reference: RESEARCH §F (validate-references batching) + CONTEXT D-P2 #3.
 */
export interface ValidatedTurnRefs {
  projects: ValidateProjectsResult;
  calendar: ValidateCalendarResult;
}

export async function validateTurnReferences(
  userId: string,
  allProjectIds: string[],
  calendarId: string | null | undefined,
): Promise<ValidatedTurnRefs> {
  // Deduplicate project IDs across all actions in this turn (Pitfall 5).
  const uniqueProjectIds = Array.from(new Set(allProjectIds));
  const [projects, calendar] = await Promise.all([
    validateProjectIds(userId, uniqueProjectIds),
    validateCalendarId(userId, calendarId),
  ]);
  return { projects, calendar };
}

export async function validateCalendarId(
  userId: string,
  calendarId: string | null | undefined,
): Promise<ValidateCalendarResult> {
  const rows = await db
    .select({
      defaultCalendarId: users.gcalDefaultCalendarId,
      visibleCalendarIds: users.gcalVisibleCalendarIds,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return { ok: false, calendarId: null };

  // No calendar_id from the model → use the user's default (or "primary"
  // fallback if no default ever set).
  if (!calendarId) {
    return { ok: true, calendarId: row.defaultCalendarId ?? "primary" };
  }

  if (calendarId === row.defaultCalendarId) {
    return { ok: true, calendarId };
  }
  if (row.visibleCalendarIds && row.visibleCalendarIds.includes(calendarId)) {
    return { ok: true, calendarId };
  }
  if (calendarId === "primary") {
    return { ok: true, calendarId };
  }
  return { ok: false, calendarId: null };
}
