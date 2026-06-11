/**
 * JARVIS server-side ActionExecutor.
 *
 * Phase 5 Plan 05-02 Task 2.
 *
 * Implements the `ActionExecutor` interface from `@hyperpolymath/jarvis-core`
 * by wiring it to Drizzle (tasks / captures / hashtags / junction tables)
 * and `@/lib/gcal/events` (createEventForJarvis). The Route Handler at
 * `app/api/jarvis/route.ts` constructs this executor per request after
 * re-deriving `userId` from `getClaims()`.
 *
 * INVARIANTS (load-bearing per JARVIS-12 / JARVIS-14 / JARVIS-17 / D-14):
 *   1. `ctx.userId` is the ONLY source of userId. Model-emitted user_id
 *      (if any leaked through Zod, which it won't — the schemas in
 *      jarvis-core don't include user_id) is silently ignored.
 *   2. project_ids are re-validated against the DB BEFORE any link write
 *      via validateProjectIds. Cross-tenant project_ids fail-closed with
 *      kind:"validation".
 *   3. calendar_id is re-validated against the user's gcal_default_calendar_id
 *      + gcal_visible_calendar_ids BEFORE any gcal call.
 *   4. Every JARVIS-created capture writes `created_via: "jarvis"` (D-14)
 *      so Plan 05-04's "Convert to task" affordance can key off it.
 *   5. createTask defaults to priority P3 + status "not started" (the DB
 *      enum literal with a SPACE — not the underscore variant; see
 *      lib/db/enums.ts).
 *   6. UUIDs are generated client-side (RT-05 echo-dedupe pattern from
 *      Phase 3) so optimistic-update flows in Plan 05-03 / 05-04 can
 *      dedupe Realtime echoes by id match.
 *   7. createEvent surfaces GcalTokenRevokedError / GcalNotConnectedError
 *      as kind:"revoked" — Plan 05-03 UI shows a "Reconnect calendar"
 *      affordance off the receipt block.
 */

import { randomUUID } from "node:crypto";
import { TZDate } from "@date-fns/tz";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  captures,
  capturesHashtags,
  capturesProjects,
  jarvisFacts,
  tasks,
  tasksProjects,
} from "@/lib/db/schema";
import { upsertHashtag } from "@/app/actions/hashtags";
import { createEventForJarvis } from "@/lib/gcal/events";
import {
  GcalNotConnectedError,
  GcalTokenRevokedError,
} from "@/lib/gcal/token";
import type {
  ActionExecutor,
  AskClarificationAction,
  CreateCaptureAction,
  CreateEventAction,
  CreateTaskAction,
  ExecutionContext,
  ExecutorResult,
  RememberFactAction,
} from "@hyperpolymath/jarvis-core";
import {
  validateCalendarId,
  validateProjectIds,
} from "./validate-references";

/**
 * Phase 5.1 D-P2 #3 / JARVIS-21 — check if all model-emitted project_ids
 * are already covered by the pre-validated set from the turn boundary.
 * If so, short-circuit and return a synthetic ValidateProjectsResult.
 * If not (model emitted IDs not in the pre-validated set), fall back to
 * a full DB validation call.
 */
async function resolveProjectIds(
  ctx: ExecutionContext,
  projectIds: string[] | undefined,
): Promise<Awaited<ReturnType<typeof validateProjectIds>>> {
  if (!projectIds || projectIds.length === 0) {
    return { ok: true, ids: [], rejected: [] };
  }
  if (ctx.preValidatedProjectIds && projectIds.every((id) => ctx.preValidatedProjectIds!.has(id))) {
    // All IDs are pre-validated — skip the DB round-trip (JARVIS-21 budget)
    return { ok: true, ids: projectIds, rejected: [] };
  }
  // Fall back to full validation (defense-in-depth: model emitted an ID that
  // wasn't in the client-validated set → re-check ownership)
  return validateProjectIds(ctx.userId, projectIds);
}

export function createServerExecutor(): ActionExecutor {
  return {
    async createTask(
      input: CreateTaskAction,
      ctx: ExecutionContext,
    ): Promise<ExecutorResult> {
      // Unknown/hallucinated project IDs are DROPPED, not fatal (2026-06-11):
      // the task still lands, just unassigned — failing the whole action left
      // the user with nothing. projectCheck.ids is the validated-owned subset.
      const projectCheck = await resolveProjectIds(ctx, input.project_ids);
      if (projectCheck.rejected.length > 0) {
        console.warn(
          `[jarvis] createTask: dropping unknown project ids: ${projectCheck.rejected.join(", ")}`,
        );
      }

      const taskId = randomUUID();
      // Default-due policy (2026-06-11): a task with no explicit due date
      // lands TODAY in the user's timezone — undated tasks were vanishing
      // into limbo instead of surfacing on the Today view.
      const todayInTz = new Intl.DateTimeFormat("en-CA", {
        timeZone: ctx.userTimezone,
      }).format(new Date()); // YYYY-MM-DD
      try {
        await db.transaction(async (tx) => {
          await tx.insert(tasks).values({
            id: taskId,
            userId: ctx.userId, // JARVIS-12: from getClaims(), NEVER model
            title: input.title,
            priority: input.priority ?? "P3", // JARVIS-05 default
            status: input.status ?? "not started", // DB enum literal w/ SPACE
            // tasks.dueDate is a DATE column (no time component). Drizzle's
            // date type accepts ISO yyyy-mm-dd strings; convert from the
            // model-emitted ISO timestamp at the YYYY-MM-DD boundary.
            // The TZ-aware conversion already happened client-side in
            // chrono+TZDate (Plan 05-01 parsers); the date emitted in `due`
            // is already in the user's intended day.
            dueDate: input.due
              ? new Date(input.due).toISOString().slice(0, 10)
              : todayInTz,
          });
          if (projectCheck.ids.length > 0) {
            await tx.insert(tasksProjects).values(
              projectCheck.ids.map((pid) => ({
                taskId,
                projectId: pid,
                userId: ctx.userId, // denormalized for RLS perf (D-03)
              })),
            );
          }
        });
        return {
          ok: true,
          id: taskId,
          receipt: {
            id: taskId,
            title: input.title,
            priority: input.priority ?? "P3",
            // Defaulted due renders as an all-day "today" on receipts —
            // midnight in the user's tz converted to a UTC instant.
            due:
              input.due ??
              new Date(
                new TZDate(`${todayInTz}T00:00:00`, ctx.userTimezone).getTime(),
              ).toISOString(),
            allDay: input.due ? undefined : true,
            project_ids: projectCheck.ids,
            voice_summary: input.voice_summary,
          },
        };
      } catch (err) {
        return {
          ok: false,
          kind: "validation",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async createCapture(
      input: CreateCaptureAction,
      ctx: ExecutionContext,
    ): Promise<ExecutorResult> {
      // Same drop-don't-fail policy as createTask — see comment there.
      const projectCheck = await resolveProjectIds(ctx, input.project_ids);
      if (projectCheck.rejected.length > 0) {
        console.warn(
          `[jarvis] createCapture: dropping unknown project ids: ${projectCheck.rejected.join(", ")}`,
        );
      }

      const captureId = randomUUID();
      try {
        await db.transaction(async (tx) => {
          await tx.insert(captures).values({
            id: captureId,
            userId: ctx.userId,
            content: input.content,
            createdVia: "jarvis", // D-14
            sourceDevice: ctx.source?.device ?? null,
            sourceInput: ctx.source?.input ?? null,
          });
          // Upsert hashtags via the existing race-safe helper. The signature
          // (B2 fix) is (userId, name, txOrDb) — userId FIRST so call sites
          // can't accidentally pass `tx` as userId. tx is LAST so the upsert
          // participates in this transaction.
          for (const tag of input.hashtags ?? []) {
            const upserted = await upsertHashtag(ctx.userId, tag, tx);
            await tx
              .insert(capturesHashtags)
              .values({
                captureId,
                hashtagId: upserted.id,
                userId: ctx.userId,
              })
              .onConflictDoNothing();
          }
          if (projectCheck.ids.length > 0) {
            await tx.insert(capturesProjects).values(
              projectCheck.ids.map((pid) => ({
                captureId,
                projectId: pid,
                userId: ctx.userId,
              })),
            );
          }
        });
        return {
          ok: true,
          id: captureId,
          receipt: {
            id: captureId,
            content: input.content,
            hashtags: input.hashtags ?? [],
            project_ids: projectCheck.ids,
            voice_summary: input.voice_summary,
          },
        };
      } catch (err) {
        return {
          ok: false,
          kind: "validation",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async createEvent(
      input: CreateEventAction,
      ctx: ExecutionContext,
    ): Promise<ExecutorResult> {
      const calCheck = await validateCalendarId(ctx.userId, input.calendar_id);
      if (!calCheck.ok || !calCheck.calendarId) {
        return {
          ok: false,
          kind: "validation",
          error: "Calendar not found or not visible",
        };
      }

      try {
        const event = await createEventForJarvis(ctx.userId, {
          calendarId: calCheck.calendarId,
          title: input.title,
          description: input.description,
          start: new Date(input.start),
          end: new Date(input.end),
        });
        return {
          ok: true,
          id: event.id,
          receipt: {
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            calendar_id: event.calendarId,
            voice_summary: input.voice_summary,
          },
        };
      } catch (err) {
        if (err instanceof GcalTokenRevokedError) {
          return { ok: false, kind: "revoked", error: "Calendar disconnected" };
        }
        if (err instanceof GcalNotConnectedError) {
          return {
            ok: false,
            kind: "revoked",
            error: "Calendar not connected",
          };
        }
        return {
          ok: false,
          kind: "network",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    /**
     * Phase 5.1 (D-A1 / JARVIS-19) — ask_clarification no-op executor.
     *
     * The question payload has ALREADY been streamed to the client via the
     * `event: clarification` SSE event emitted from route.ts BEFORE this
     * executor is called. This method returns a uniform ok receipt so the
     * dispatch loop can treat ask_clarification uniformly with action tools.
     *
     * NO DB write. NO side effect. Console renders the question via the SSE event.
     */
    async askClarification(
      input: AskClarificationAction,
      _ctx: ExecutionContext,
    ): Promise<ExecutorResult> {
      return {
        ok: true,
        id: `clarification:${randomUUID()}`,
        receipt: {
          question: input.question,
          options: input.options ?? [],
          suggested_action: input.suggested_action ?? null,
        },
      };
    },

    /**
     * Phase 5.1 (D-M5 / JARVIS-18) — persist a user fact via onConflictDoUpdate.
     *
     * INVARIANTS:
     *   1. ctx.userId is the ONLY source of userId (never trust model-emitted ids).
     *   2. Uses UNIQUE(user_id, type, key) for last-write-wins semantics.
     *   3. Returns factId in receipt so the jarvis_suggested Keep/Discard path
     *      can hard-delete via forgetFactAction (Blocker 2 / D-M3).
     *   4. Fact is inserted IMMEDIATELY — the 10s countdown is the user's undo
     *      window (mirrors Phase 5's 5s undo pattern for create_task/capture).
     */
    async rememberFact(
      input: RememberFactAction,
      ctx: ExecutionContext,
    ): Promise<ExecutorResult> {
      try {
        const now = new Date();
        const [row] = await db
          .insert(jarvisFacts)
          .values({
            userId: ctx.userId, // JARVIS-12: from getClaims(), NEVER model
            type: input.type,
            key: input.key,
            value: input.value,
            source: input.source,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            // UNIQUE(user_id, type, key) — last-write-wins (D-M1)
            target: [jarvisFacts.userId, jarvisFacts.type, jarvisFacts.key],
            set: {
              value: sql`excluded.value`,
              source: sql`excluded.source`,
              updatedAt: now,
            },
          })
          .returning({ id: jarvisFacts.id });

        return {
          ok: true,
          id: `fact:${input.type}:${input.key}`,
          receipt: {
            type: input.type,
            key: input.key,
            value: input.value,
            source: input.source,
            // Surface the row id so Discard can hard-delete (Blocker 2 / D-M3)
            factId: row!.id,
          },
        };
      } catch (err) {
        return {
          ok: false,
          kind: "validation",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
