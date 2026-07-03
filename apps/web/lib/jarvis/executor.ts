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
import { google } from "googleapis";
import { and, eq, ilike, inArray, sql } from "drizzle-orm";
import { getUserKeyOrNull } from "@/lib/byok/keys";
import { db } from "@/lib/db";
import {
  captures,
  capturesHashtags,
  capturesProjects,
  jarvisFacts,
  people,
  peopleReferences,
  tasks,
  tasksProjects,
} from "@/lib/db/schema";
import { upsertHashtag } from "@/app/actions/hashtags";
import { scheduleAutoTagging } from "@/lib/captures/auto-tag";
import {
  reconcilePersonReferencesForUser,
  resolveOrCreatePersonForUser,
  type PersonRefFromType,
} from "@/app/actions/people";
import { getPeopleForUser } from "@/lib/db/queries/people";
import {
  createEventForJarvis,
  deleteEvent as gcalDeleteEvent,
  getEvent as gcalGetEvent,
  listEvents,
  patchEvent,
} from "@/lib/gcal/events";
import {
  GcalNotConnectedError,
  GcalTokenRevokedError,
  getAuthenticatedGoogleOAuthClient,
  getValidGcalToken,
} from "@/lib/gcal/token";
import type {
  ActionExecutor,
  AskClarificationAction,
  ComputerUseAction,
  CreateCaptureAction,
  CreateEventAction,
  CreatePersonAction,
  CreateTaskAction,
  DeleteCaptureAction,
  DeleteEventAction,
  DeleteTaskAction,
  ExecutionContext,
  ExecutorResult,
  FindCapturesAction,
  FindEventsAction,
  FindPeopleAction,
  FindTasksAction,
  GetNewsAction,
  GetWeatherAction,
  LinkPeopleAction,
  ReadGmailAction,
  OpenAppAction,
  OpenUrlAction,
  PlayMusicAction,
  PressKeyAction,
  RememberFactAction,
  RunApplescriptAction,
  RunShortcutAction,
  SendMessageAction,
  SystemControlAction,
  TakeScreenshotAction,
  TypeTextAction,
  UpdateCaptureAction,
  UpdateEventAction,
  UpdateTaskAction,
  WebSearchAction,
} from "@hyperpolymath/jarvis-core";
import { validateCalendarId, validateProjectIds } from "./validate-references";

/**
 * Phase 5.1 D-P2 #3 / JARVIS-21 — check if all model-emitted project_ids
 * are already covered by the pre-validated set from the turn boundary.
 * If so, short-circuit and return a synthetic ValidateProjectsResult.
 * If not (model emitted IDs not in the pre-validated set), fall back to
 * a full DB validation call.
 */
async function resolveProjectIds(
  ctx: ExecutionContext,
  projectIds: string[] | undefined
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

// Calendar date (YYYY-MM-DD) of an ISO timestamp in the USER'S timezone.
// Slicing the UTC ISO string shifted evening deadlines ("tonight 11pm" EDT
// = 03:00Z) onto the next day. Date-only strings pass through untouched —
// `new Date("2026-06-12")` is midnight UTC, which formats to the PREVIOUS
// day in western timezones.
function dateInUserTz(iso: string, tz: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
}

// Clicky slice — WMO weather interpretation codes → human phrase.
// Open-Meteo `weather_code` follows the WMO 4677 table.
function describeWeatherCode(code: number): string {
  if (code === 0) return "clear skies";
  if (code === 1) return "mainly clear";
  if (code === 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "foggy";
  if (code >= 51 && code <= 57) return "drizzling";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "raining";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snowing";
  if (code === 95) return "thunderstorms";
  if (code === 96 || code === 99) return "thunderstorms with hail";
  return "unsettled";
}

export function createServerExecutor(): ActionExecutor {
  return {
    async createTask(input: CreateTaskAction, ctx: ExecutionContext): Promise<ExecutorResult> {
      // Unknown/hallucinated project IDs are DROPPED, not fatal (2026-06-11):
      // the task still lands, just unassigned — failing the whole action left
      // the user with nothing. projectCheck.ids is the validated-owned subset.
      const projectCheck = await resolveProjectIds(ctx, input.project_ids);
      if (projectCheck.rejected.length > 0) {
        console.warn(
          `[jarvis] createTask: dropping unknown project ids: ${projectCheck.rejected.join(", ")}`
        );
      }

      const taskId = randomUUID();
      // No-date → Inbox policy (Phase 19, D-02): a task with no explicit due
      // date lands in the Inbox (dueDate = NULL), NOT silently dated to today.
      // The model must emit an explicit `due` when the user specifies one;
      // silence means Inbox. This reverses the prior default-due-to-today
      // behavior so "no date" reliably reaches the first-class Inbox surface.
      try {
        await db.transaction(async (tx) => {
          await tx.insert(tasks).values({
            id: taskId,
            userId: ctx.userId, // JARVIS-12: from getClaims(), NEVER model
            title: input.title,
            priority: input.priority ?? "P3", // JARVIS-05 default
            status: input.status ?? "not started", // DB enum literal w/ SPACE
            // tasks.dueDate is a DATE column (no time component). Convert the
            // model-emitted timestamp to the calendar date in the USER'S
            // timezone, never the UTC date. No due → NULL → Inbox (D-02).
            dueDate: input.due ? dateInUserTz(input.due, ctx.userTimezone) : null,
          });
          if (projectCheck.ids.length > 0) {
            await tx.insert(tasksProjects).values(
              projectCheck.ids.map((pid) => ({
                taskId,
                projectId: pid,
                userId: ctx.userId, // denormalized for RLS perf (D-03)
              }))
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
            // No-date → Inbox (D-02 / I-7): an undated task carries NO due on
            // the receipt and sets `inbox: true` so the formatter renders
            // "Added to your Inbox." instead of synthesizing a today date.
            due: input.due ? dateInUserTz(input.due, ctx.userTimezone) : undefined,
            inbox: !input.due,
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
      ctx: ExecutionContext
    ): Promise<ExecutorResult> {
      // Same drop-don't-fail policy as createTask — see comment there.
      const projectCheck = await resolveProjectIds(ctx, input.project_ids);
      if (projectCheck.rejected.length > 0) {
        console.warn(
          `[jarvis] createCapture: dropping unknown project ids: ${projectCheck.rejected.join(", ")}`
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
              }))
            );
          }
        });
        // Background auto-tagging (after the capture commits). Scheduled via
        // after() inside the helper so it never delays the JARVIS turn; any
        // explicit model-supplied hashtags are deduped against the DB so they
        // are not re-applied. Realtime surfaces the result live.
        scheduleAutoTagging(captureId, ctx.userId, input.content);
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

    async createEvent(input: CreateEventAction, ctx: ExecutionContext): Promise<ExecutorResult> {
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
      _ctx: ExecutionContext
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
    async rememberFact(input: RememberFactAction, ctx: ExecutionContext): Promise<ExecutorResult> {
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

    // -------------------------------------------------------------------------
    // Phase 16 Plan 16-03 — CRUD update / delete / find methods.
    //
    // INVARIANT (D-3 / SECURITY): Every update/delete WHERE clause MUST include
    // BOTH `eq(table.id, input.id)` AND `eq(table.userId, ctx.userId)`.
    // If the row doesn't exist OR belongs to another user, rowcount === 0 and
    // we return { ok: false, kind: "not_found" } without throwing.
    // This is RLS-equivalent ownership re-verification at the executor boundary.
    // -------------------------------------------------------------------------

    async updateTask(input: UpdateTaskAction, ctx: ExecutionContext): Promise<ExecutorResult> {
      // Strict tool use sends ALL fields; null means "not changing" (the 24-optional
      // grammar limit forces nullable-required schemas). "" clears clearable fields.
      const set: Partial<typeof tasks.$inferInsert> = {};
      if (input.title != null) set.title = input.title;
      // `description` maps to tasks.notes column — tasks table has no description column
      if (input.description != null)
        set.notes = input.description === "" ? null : input.description;
      if (input.priority != null) set.priority = input.priority;
      if (input.status != null) set.status = input.status;
      if (input.due != null) {
        set.dueDate = input.due === "" ? null : dateInUserTz(input.due, ctx.userTimezone);
      }
      set.updatedAt = new Date();

      // SELECT-before-UPDATE in a transaction to capture the `before` snapshot.
      // We only include the keys present in `set` (excluding updatedAt) so the
      // undo payload is a minimal diff, not the full row.
      let beforeSnapshot: Record<string, unknown> = {};
      let rows: {
        id: string;
        title: string;
        status: string;
        priority: string;
        dueDate: string | null;
      }[] = [];

      const result = await db.transaction(async (tx) => {
        const existing = await tx
          .select({
            id: tasks.id,
            title: tasks.title,
            notes: tasks.notes,
            priority: tasks.priority,
            status: tasks.status,
            dueDate: tasks.dueDate,
          })
          .from(tasks)
          .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)))
          .limit(1);

        if (existing.length === 0) return null;

        // Build before: pick only keys mirroring `set` (excluding updatedAt)
        const prev = existing[0]!;
        if (input.title != null) beforeSnapshot.title = prev.title;
        if (input.description != null) beforeSnapshot.notes = prev.notes;
        if (input.priority != null) beforeSnapshot.priority = prev.priority;
        if (input.status != null) beforeSnapshot.status = prev.status;
        if (input.due != null) beforeSnapshot.dueDate = prev.dueDate;

        const updated = await tx
          .update(tasks)
          .set(set)
          .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)))
          .returning({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            priority: tasks.priority,
            dueDate: tasks.dueDate,
          });
        return updated;
      });

      rows = result ?? [];

      if (rows.length === 0) {
        return { ok: false, kind: "not_found", error: "Task not found" };
      }
      // project_ids update: join-table management is MVP-deferred. updateTask
      // intentionally ignores project_ids if present — cross-referencing the
      // tasksProjects junction table (delete-all + re-insert) is a separate
      // concern and will land in a follow-up plan.
      return {
        ok: true,
        id: input.id,
        receipt: { id: input.id, changes: set, before: beforeSnapshot, after: rows[0] },
      };
    },

    async deleteTask(input: DeleteTaskAction, ctx: ExecutionContext): Promise<ExecutorResult> {
      const rows = await db
        .delete(tasks)
        .where(and(eq(tasks.id, input.id), eq(tasks.userId, ctx.userId)))
        .returning();

      if (rows.length === 0) {
        return { ok: false, kind: "not_found", error: "Task not found" };
      }
      return {
        ok: true,
        id: input.id,
        receipt: { id: input.id, title: rows[0]!.title, deleted: true, snapshot: rows[0] },
      };
    },

    async updateCapture(
      input: UpdateCaptureAction,
      ctx: ExecutionContext
    ): Promise<ExecutorResult> {
      const set: Partial<typeof captures.$inferInsert> = {};
      if (input.content != null) set.content = input.content;
      set.updatedAt = new Date();

      // SELECT-before-UPDATE in a transaction to capture the `before` snapshot.
      let beforeSnapshot: Record<string, unknown> = {};
      let rows: { id: string; content: string }[] = [];

      const result = await db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: captures.id, content: captures.content })
          .from(captures)
          .where(and(eq(captures.id, input.id), eq(captures.userId, ctx.userId)))
          .limit(1);

        if (existing.length === 0) return null;

        // Build before: only keys mirroring `set` (excluding updatedAt)
        const prev = existing[0]!;
        if (input.content != null) beforeSnapshot.content = prev.content;

        const updated = await tx
          .update(captures)
          .set(set)
          .where(and(eq(captures.id, input.id), eq(captures.userId, ctx.userId)))
          .returning({ id: captures.id, content: captures.content });
        return updated;
      });

      rows = result ?? [];

      if (rows.length === 0) {
        return { ok: false, kind: "not_found", error: "Capture not found" };
      }
      // hashtags and project_ids updates are MVP-deferred: same join-table
      // concern as updateTask.project_ids. The content update is what matters
      // for the JARVIS correction flow ("change that qc to say X instead").
      return {
        ok: true,
        id: input.id,
        receipt: { id: input.id, changes: set, before: beforeSnapshot, after: rows[0] },
      };
    },

    async deleteCapture(
      input: DeleteCaptureAction,
      ctx: ExecutionContext
    ): Promise<ExecutorResult> {
      const rows = await db
        .delete(captures)
        .where(and(eq(captures.id, input.id), eq(captures.userId, ctx.userId)))
        .returning();

      if (rows.length === 0) {
        return { ok: false, kind: "not_found", error: "Capture not found" };
      }
      return {
        ok: true,
        id: input.id,
        receipt: {
          id: input.id,
          preview: rows[0]!.content.slice(0, 80),
          deleted: true,
          snapshot: rows[0],
        },
      };
    },

    async findTasks(input: FindTasksAction, ctx: ExecutionContext): Promise<ExecutorResult> {
      const conditions = [eq(tasks.userId, ctx.userId)];
      if (input.query) {
        conditions.push(ilike(tasks.title, `%${input.query}%`));
      }
      if (input.status && input.status.length > 0) {
        conditions.push(inArray(tasks.status, input.status));
      }
      if (input.priority && input.priority.length > 0) {
        conditions.push(inArray(tasks.priority, input.priority));
      }
      // project_id filter: joining tasksProjects is straightforward but adds
      // query complexity. For MVP, project scoping on find_tasks is deferred;
      // document as a future improvement in the SUMMARY.
      const rows = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
        })
        .from(tasks)
        .where(and(...conditions))
        .limit(10);

      return { ok: true, id: "find_tasks", receipt: { matches: rows } };
    },

    async findCaptures(input: FindCapturesAction, ctx: ExecutionContext): Promise<ExecutorResult> {
      const conditions = [eq(captures.userId, ctx.userId)];
      if (input.query) {
        conditions.push(ilike(captures.content, `%${input.query}%`));
      }
      if (input.since) {
        conditions.push(sql`${captures.createdAt} >= ${new Date(input.since)}`);
      }
      // hashtag filter: would require joining capturesHashtags + hashtags;
      // deferred for MVP given single-user scale and query complexity cost.
      const rows = await db
        .select({
          id: captures.id,
          preview: sql<string>`substr(${captures.content}, 1, 120)`,
          createdAt: captures.createdAt,
        })
        .from(captures)
        .where(and(...conditions))
        .limit(10);

      return { ok: true, id: "find_captures", receipt: { matches: rows } };
    },

    async updateEvent(input: UpdateEventAction, ctx: ExecutionContext): Promise<ExecutorResult> {
      try {
        const cal = await getValidGcalToken(ctx.userId);
        const patch: Partial<import("googleapis").calendar_v3.Schema$Event> = {};
        if (input.title != null) patch.summary = input.title;
        if (input.description != null) patch.description = input.description;
        if (input.start != null) {
          patch.start = { dateTime: input.start, timeZone: ctx.userTimezone };
        }
        if (input.end != null) {
          patch.end = { dateTime: input.end, timeZone: ctx.userTimezone };
        }

        // Fetch the current event to build the `before` snapshot for undo.
        // Only capture keys mirroring what we're about to patch.
        const { data: existing } = await gcalGetEvent(cal, input.calendar_id, input.id);
        const before: Record<string, unknown> = {};
        if (input.title != null) before.summary = existing.summary;
        if (input.description != null) before.description = existing.description;
        if (input.start != null) before.start = existing.start;
        if (input.end != null) before.end = existing.end;

        const { data } = await patchEvent(cal, input.calendar_id, input.id, patch);
        return {
          ok: true,
          id: input.id,
          receipt: {
            id: input.id,
            calendar_id: input.calendar_id,
            changes: patch,
            before,
            after: { summary: data.summary, start: data.start, end: data.end },
          },
        };
      } catch (err) {
        if (err instanceof GcalNotConnectedError) {
          return { ok: false, kind: "not_connected", error: "Google Calendar not connected" };
        }
        if (err instanceof GcalTokenRevokedError) {
          return { ok: false, kind: "revoked", error: "Google Calendar access revoked" };
        }
        // 404 from getEvent — event not found
        const code =
          (err as { code?: number; status?: number } | null)?.code ??
          (err as { code?: number; status?: number } | null)?.status;
        if (code === 404 || code === 410) {
          return { ok: false, kind: "not_found", error: "Event not found" };
        }
        throw err;
      }
    },

    async deleteEvent(input: DeleteEventAction, ctx: ExecutionContext): Promise<ExecutorResult> {
      try {
        const cal = await getValidGcalToken(ctx.userId);

        // Fetch the event before deleting to build a snapshot for undo.
        // If getEvent 404s, the snapshot is omitted — undo will be unavailable
        // but deletion still proceeds (acceptable degraded path).
        let snapshot: Record<string, unknown> | undefined = undefined;
        try {
          const { data } = await gcalGetEvent(cal, input.calendar_id, input.id);
          // Strip auto-assigned fields that would break re-insert
          const { etag, htmlLink, iCalUID, ...rest } = data as Record<string, unknown>;
          void etag;
          void htmlLink;
          void iCalUID;
          snapshot = rest;
        } catch {
          // 404 / 410 — snapshot unavailable; proceed with delete
        }

        await gcalDeleteEvent(cal, input.calendar_id, input.id);
        return {
          ok: true,
          id: input.id,
          receipt: {
            id: input.id,
            calendar_id: input.calendar_id,
            deleted: true,
            ...(snapshot ? { snapshot } : {}),
          },
        };
      } catch (err) {
        if (err instanceof GcalNotConnectedError) {
          return { ok: false, kind: "not_connected", error: "Google Calendar not connected" };
        }
        if (err instanceof GcalTokenRevokedError) {
          return { ok: false, kind: "revoked", error: "Google Calendar access revoked" };
        }
        throw err;
      }
    },

    async findEvents(input: FindEventsAction, ctx: ExecutionContext): Promise<ExecutorResult> {
      try {
        const cal = await getValidGcalToken(ctx.userId);
        // Phase 16 Open Question 3: search the default calendar only for MVP.
        // Multi-calendar search requires separate list calls + dedup by event id.
        const calendarId = ctx.defaultCalendarId ?? "primary";
        const { data } = await listEvents(cal, {
          calendarId,
          q: input.query ?? undefined,
          timeMin: input.time_min ?? new Date().toISOString(),
          timeMax: input.time_max ?? undefined,
          singleEvents: true,
          maxResults: 10,
        });
        const matches = (data.items ?? []).map((e) => ({
          id: e.id,
          calendar_id: calendarId,
          title: e.summary,
          start: e.start,
          end: e.end,
        }));
        return { ok: true, id: "find_events", receipt: { matches } };
      } catch (err) {
        if (err instanceof GcalNotConnectedError) {
          return { ok: false, kind: "not_connected", error: "Google Calendar not connected" };
        }
        if (err instanceof GcalTokenRevokedError) {
          return { ok: false, kind: "revoked", error: "Google Calendar access revoked" };
        }
        throw err;
      }
    },

    // -------------------------------------------------------------------------
    // Phase D — people knowledge graph: create / find / link people.
    //
    // INVARIANT (SECURITY): ctx.userId is the ONLY source of userId. The model
    // never emits a userId; every people/people_references write is scoped to
    // ctx.userId via the helpers in app/actions/people.ts.
    // -------------------------------------------------------------------------

    async createPerson(input: CreatePersonAction, ctx: ExecutionContext): Promise<ExecutorResult> {
      const name = input.name.trim();
      if (!name) {
        return { ok: false, kind: "validation", error: "Person name is required" };
      }
      try {
        const [row] = await db
          .insert(people)
          .values({
            userId: ctx.userId, // JARVIS-12: from getClaims(), NEVER model
            name,
            email: input.email?.trim() ? input.email.trim() : null,
            phone: input.phone?.trim() ? input.phone.trim() : null,
            bio: input.bio?.trim() ? input.bio.trim() : null,
            tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
          })
          .returning({ id: people.id, name: people.name });
        if (!row) {
          return { ok: false, kind: "internal", error: "Person insert returned no row" };
        }
        return {
          ok: true,
          id: row.id,
          receipt: {
            id: row.id,
            name: row.name,
            email: input.email?.trim() || undefined,
            phone: input.phone?.trim() || undefined,
            tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
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

    async findPeople(input: FindPeopleAction, ctx: ExecutionContext): Promise<ExecutorResult> {
      // getPeopleForUser returns the full name-sorted roster with reference
      // counts. For MVP scale (single user, hundreds of people) we filter in JS
      // by a case-insensitive substring rather than adding a dedicated query.
      const roster = await getPeopleForUser(ctx.userId);
      const q = input.query?.trim().toLowerCase();
      const filtered = q
        ? roster.filter(
            (person) =>
              person.name.toLowerCase().includes(q) ||
              person.tags.some((tag) => tag.toLowerCase().includes(q))
          )
        : roster;
      const matches = filtered.slice(0, 10).map((person) => ({
        id: person.id,
        name: person.name,
        tags: person.tags,
        reference_count: person.referenceCount,
      }));
      return { ok: true, id: "find_people", receipt: { matches } };
    },

    // -------------------------------------------------------------------------
    // Computer-control tools — open_url / open_app / web_search
    //
    // These tools CANNOT touch the Mac from the server. Each executor arm
    // validates input and returns a structured { ok, action } result for the
    // desktop client to execute. No DB writes, no gcal calls.
    //
    // Result contract (parallel agent builds desktop client against this):
    //   open_url  → { ok: true, action: { kind: "open_url", url, label } }
    //   open_app  → { ok: true, action: { kind: "open_app", app, label } }
    //   web_search → { ok: true, action: { kind: "open_url", url, label } }
    // -------------------------------------------------------------------------

    async openUrl(input: OpenUrlAction, _ctx: ExecutionContext): Promise<ExecutorResult> {
      const label = input.label ?? input.url;
      return {
        ok: true,
        id: `open_url:${input.url}`,
        receipt: { url: input.url, label },
        action: { kind: "open_url", url: input.url, label },
      };
    },

    async openApp(input: OpenAppAction, _ctx: ExecutionContext): Promise<ExecutorResult> {
      const label = input.label ?? input.app;
      return {
        ok: true,
        id: `open_app:${input.app}`,
        receipt: { app: input.app, label },
        action: { kind: "open_app", app: input.app, label },
      };
    },

    async webSearch(input: WebSearchAction, _ctx: ExecutionContext): Promise<ExecutorResult> {
      const engine = input.engine ?? "google";
      let url: string;
      if (engine === "maps") {
        url =
          "https://www.google.com/maps/search/?api=1&query=" +
          encodeURIComponent(input.query);
      } else {
        url =
          "https://www.google.com/search?q=" + encodeURIComponent(input.query);
      }
      const label = engine === "maps" ? "Google Maps" : "the web";
      return {
        ok: true,
        id: `web_search:${input.query}`,
        receipt: { query: input.query, engine, url, label },
        action: { kind: "open_url", url, label },
      };
    },

    // -------------------------------------------------------------------------
    // Clicky slice — desktop action tools.
    //
    // Same pattern as open_url/open_app: validate args server-side, return a
    // structured { ok, receipt?, action } result. NOTHING here executes
    // AppleScript or touches the Mac — the desktop dispatcher does that, keyed
    // off action.kind. get_weather is the exception: it runs fully server-side
    // (Open-Meteo fetch) and returns data in the receipt with no action.
    // -------------------------------------------------------------------------

    async sendMessage(input: SendMessageAction, _ctx: ExecutionContext): Promise<ExecutorResult> {
      const recipient = input.recipient.trim();
      const text = input.text.trim();
      if (!recipient) {
        return { ok: false, kind: "validation", error: "send_message requires a recipient" };
      }
      if (!text) {
        return { ok: false, kind: "validation", error: "send_message requires message text" };
      }
      return {
        ok: true,
        id: `send_message:${recipient}`,
        receipt: { app: input.app, recipient, text, requires_confirm: true },
        // requires_confirm is load-bearing: the desktop holds the AppleScript
        // send until the user confirms aloud (iMessage has no draft verb).
        action: { kind: "send_message", app: input.app, recipient, text, requires_confirm: true },
      };
    },

    async systemControl(input: SystemControlAction, _ctx: ExecutionContext): Promise<ExecutorResult> {
      if ((input.action === "volume" || input.action === "brightness")) {
        const v = typeof input.value === "string" ? Number(input.value) : input.value;
        if (typeof v !== "number" || Number.isNaN(v) || v < 0 || v > 100) {
          return {
            ok: false,
            kind: "validation",
            error: `system_control ${input.action} requires a numeric value 0-100`,
          };
        }
        return {
          ok: true,
          id: `system_control:${input.action}`,
          receipt: { action: input.action, value: v },
          action: { kind: "system_control", action: input.action, value: v },
        };
      }
      // focus: optional string value (Focus-mode name; omit = off). sleep: no value.
      return {
        ok: true,
        id: `system_control:${input.action}`,
        receipt: { action: input.action, ...(input.value !== undefined ? { value: input.value } : {}) },
        action: {
          kind: "system_control",
          action: input.action,
          ...(input.value !== undefined ? { value: input.value } : {}),
        },
      };
    },

    async typeText(input: TypeTextAction, _ctx: ExecutionContext): Promise<ExecutorResult> {
      return {
        ok: true,
        id: "type_text",
        receipt: { text: input.text },
        action: { kind: "type_text", text: input.text },
      };
    },

    async pressKey(input: PressKeyAction, _ctx: ExecutionContext): Promise<ExecutorResult> {
      const modifiers = (input.modifiers ?? []).map((m) => m.trim().toLowerCase()).filter(Boolean);
      return {
        ok: true,
        id: `press_key:${input.key}`,
        receipt: { key: input.key, modifiers },
        action: { kind: "press_key", key: input.key, modifiers },
      };
    },

    async takeScreenshot(input: TakeScreenshotAction, _ctx: ExecutionContext): Promise<ExecutorResult> {
      const describe = input.describe ?? true;
      return {
        ok: true,
        id: "take_screenshot",
        receipt: { describe },
        action: { kind: "take_screenshot", describe },
      };
    },

    async runApplescript(input: RunApplescriptAction, _ctx: ExecutionContext): Promise<ExecutorResult> {
      const label = input.label.trim();
      const script = input.script.trim();
      if (!label || !script) {
        return { ok: false, kind: "validation", error: "run_applescript requires label and script" };
      }
      return {
        ok: true,
        id: `run_applescript:${label}`,
        receipt: { label, script },
        action: { kind: "run_applescript", label, script },
      };
    },

    async runShortcut(input: RunShortcutAction, _ctx: ExecutionContext): Promise<ExecutorResult> {
      const name = input.name.trim();
      if (!name) {
        return { ok: false, kind: "validation", error: "run_shortcut requires a shortcut name" };
      }
      return {
        ok: true,
        id: `run_shortcut:${name}`,
        receipt: { name, ...(input.input !== undefined ? { input: input.input } : {}) },
        action: {
          kind: "run_shortcut",
          name,
          ...(input.input !== undefined ? { input: input.input } : {}),
        },
      };
    },

    async playMusic(input: PlayMusicAction, _ctx: ExecutionContext): Promise<ExecutorResult> {
      const app = input.app ?? "music";
      const query = input.query?.trim() || undefined;
      return {
        ok: true,
        id: `play_music:${query ?? "resume"}`,
        receipt: { app, ...(query ? { query } : {}) },
        action: { kind: "play_music", app, ...(query ? { query } : {}) },
      };
    },

    async computerUse(input: ComputerUseAction, _ctx: ExecutionContext): Promise<ExecutorResult> {
      // Computer Use fallback: mint a session_id and hand the task to the
      // desktop, which drives the agentic loop against
      // /api/jarvis/computer-use/step. Nothing executes server-side here.
      const task = input.task.trim();
      if (!task) {
        return { ok: false, kind: "validation", error: "computer_use requires a task" };
      }
      const sessionId = randomUUID();
      return {
        ok: true,
        id: `computer_use:${sessionId}`,
        receipt: { task, session_id: sessionId },
        action: { kind: "computer_use", task, session_id: sessionId },
      };
    },

    async getWeather(input: GetWeatherAction, _ctx: ExecutionContext): Promise<ExecutorResult> {
      // Fully server-side: Open-Meteo geocoding + forecast (free, keyless).
      const location =
        input.location?.trim() || process.env.JARVIS_DEFAULT_LOCATION || "Boston";
      try {
        const geoRes = await fetch(
          "https://geocoding-api.open-meteo.com/v1/search?count=1&name=" +
            encodeURIComponent(location),
        );
        if (!geoRes.ok) {
          return { ok: false, kind: "network", error: `Geocoding failed (${geoRes.status})` };
        }
        const geo = (await geoRes.json()) as {
          results?: { latitude: number; longitude: number; name: string; admin1?: string; country?: string }[];
        };
        const place = geo.results?.[0];
        if (!place) {
          return { ok: false, kind: "not_found", error: `No location found matching "${location}"` };
        }
        const fcRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
            "&current=temperature_2m,weather_code,wind_speed_10m",
        );
        if (!fcRes.ok) {
          return { ok: false, kind: "network", error: `Forecast fetch failed (${fcRes.status})` };
        }
        const fc = (await fcRes.json()) as {
          current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number };
        };
        const current = fc.current;
        if (!current || typeof current.temperature_2m !== "number") {
          return { ok: false, kind: "network", error: "Forecast response missing current weather" };
        }
        const tempC = Math.round(current.temperature_2m * 10) / 10;
        const tempF = Math.round((tempC * 9) / 5 + 32);
        // Open-Meteo default wind_speed_10m unit is km/h.
        const windKph = Math.round(current.wind_speed_10m ?? 0);
        const weather = {
          location: place.name,
          tempC,
          tempF,
          condition: describeWeatherCode(current.weather_code ?? -1),
          windKph,
        };
        return { ok: true, id: `get_weather:${place.name}`, receipt: { weather } };
      } catch (err) {
        return {
          ok: false,
          kind: "network",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async readGmail(input: ReadGmailAction, ctx: ExecutionContext): Promise<ExecutorResult> {
      // Fully server-side: uses the existing Google OAuth client (same tokens
      // Calendar + Drive already ride) extended with the gmail.readonly scope
      // added in /api/gcal/auth. Metadata + snippet only — never the full body.
      const requested = typeof input.maxResults === "number" ? input.maxResults : 10;
      const maxResults = Math.min(Math.max(1, Math.floor(requested)), 25);
      const query = input.query?.trim() || undefined;

      let auth;
      try {
        auth = await getAuthenticatedGoogleOAuthClient(ctx.userId);
      } catch (err) {
        if (err instanceof GcalNotConnectedError) {
          return {
            ok: false,
            kind: "not_connected",
            error:
              "Google account not connected — connect Google in Settings so JARVIS can read your inbox.",
          };
        }
        if (err instanceof GcalTokenRevokedError) {
          return {
            ok: false,
            kind: "revoked",
            error:
              "Google access was revoked — reconnect Google in Settings so JARVIS can read your inbox.",
          };
        }
        return {
          ok: false,
          kind: "internal",
          error: err instanceof Error ? err.message : String(err),
        };
      }

      try {
        const gmail = google.gmail({ version: "v1", auth });
        const listRes = await gmail.users.messages.list({
          userId: "me",
          maxResults,
          ...(query ? { q: query } : {}),
        });
        const ids = (listRes.data.messages ?? [])
          .map((m) => m.id)
          .filter((id): id is string => typeof id === "string");

        if (ids.length === 0) {
          return {
            ok: true,
            id: `read_gmail:empty`,
            receipt: { messages: [], count: 0, ...(query ? { query } : {}) },
          };
        }

        // Fetch metadata + snippet for each message in parallel. `format: "metadata"`
        // with `metadataHeaders` is the compact, snippet-included shape (no body).
        const details = await Promise.all(
          ids.map((id) =>
            gmail.users.messages
              .get({
                userId: "me",
                id,
                format: "metadata",
                metadataHeaders: ["From", "Subject", "Date"],
              })
              .then((r) => r.data)
              .catch(() => null),
          ),
        );

        const messages = details
          .filter((d): d is NonNullable<typeof d> => d !== null)
          .map((d) => {
            const headers = d.payload?.headers ?? [];
            const getHeader = (name: string): string | undefined => {
              const h = headers.find(
                (x) => (x.name ?? "").toLowerCase() === name.toLowerCase(),
              );
              return h?.value ?? undefined;
            };
            return {
              id: d.id ?? undefined,
              from: getHeader("From"),
              subject: getHeader("Subject"),
              date: getHeader("Date"),
              snippet: d.snippet ?? undefined,
            };
          });

        return {
          ok: true,
          id: `read_gmail:${messages.length}`,
          receipt: {
            messages,
            count: messages.length,
            ...(query ? { query } : {}),
          },
        };
      } catch (err) {
        // A missing gmail.readonly scope shows up here (403 / insufficientPermissions).
        const message = err instanceof Error ? err.message : String(err);
        const looksLikeScope =
          /insufficientPermissions|insufficient authentication scopes|Insufficient Permission/i.test(
            message,
          );
        if (looksLikeScope) {
          return {
            ok: false,
            kind: "revoked",
            error:
              "Google account is missing Gmail permission — reconnect Google in Settings to grant Gmail read access.",
          };
        }
        return { ok: false, kind: "network", error: message };
      }
    },

    async getNews(input: GetNewsAction, ctx: ExecutionContext): Promise<ExecutorResult> {
      // Fully server-side: Guardian Open Platform Content API. BYOK-first
      // (per-user "guardian" provider key) with an owner env fallback of
      // GUARDIAN_API_KEY so the owner-flavoured devices don't need a saved key.
      const requested = typeof input.maxResults === "number" ? input.maxResults : 8;
      const maxResults = Math.min(Math.max(1, Math.floor(requested)), 15);
      const topic = input.topic?.trim() || undefined;

      const userKey = await getUserKeyOrNull(ctx.userId, "guardian");
      const apiKey = userKey ?? process.env.GUARDIAN_API_KEY ?? null;
      if (!apiKey) {
        return {
          ok: false,
          kind: "not_connected",
          error:
            "No Guardian API key configured — add one in Settings (grab a free key at open-platform.theguardian.com).",
        };
      }

      const params = new URLSearchParams({
        "api-key": apiKey,
        "show-fields": "trailText",
        "page-size": String(maxResults),
        "order-by": "newest",
      });
      if (topic) params.set("q", topic);

      try {
        const res = await fetch(
          `https://content.guardianapis.com/search?${params.toString()}`,
        );
        if (!res.ok) {
          return {
            ok: false,
            kind: "network",
            error: `Guardian API request failed (${res.status})`,
          };
        }
        const body = (await res.json()) as {
          response?: {
            results?: Array<{
              webTitle?: string;
              sectionName?: string;
              webPublicationDate?: string;
              webUrl?: string;
              fields?: { trailText?: string };
            }>;
          };
        };
        const results = body.response?.results ?? [];
        const articles = results.map((r) => ({
          title: r.webTitle,
          section: r.sectionName,
          published: r.webPublicationDate,
          trailText: r.fields?.trailText,
          url: r.webUrl,
        }));
        return {
          ok: true,
          id: `get_news:${articles.length}`,
          receipt: {
            articles,
            count: articles.length,
            ...(topic ? { topic } : {}),
          },
        };
      } catch (err) {
        return {
          ok: false,
          kind: "network",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async linkPeople(input: LinkPeopleAction, ctx: ExecutionContext): Promise<ExecutorResult> {
      const fromType = input.from_type as PersonRefFromType;
      const fromId = input.from_id.trim();
      if (!fromId) {
        return { ok: false, kind: "validation", error: "from_id is required" };
      }
      try {
        // Resolve-or-create each name into a person id (existing people are
        // reused case-insensitively; new names create a person on the fly).
        const resolved: { id: string; name: string; created: boolean }[] = [];
        for (const rawName of input.person_names) {
          const person = await resolveOrCreatePersonForUser(ctx.userId, rawName);
          if (person) resolved.push(person);
        }
        const newIds = resolved.map((r) => r.id);

        // ADD semantics: reconcilePersonReferencesForUser REPLACES the reference
        // set for (fromType, fromId), so we union the newly-resolved ids with the
        // references that already exist before reconciling. This adds links
        // without silently deleting any the entity already had.
        const existing = (
          await db
            .select({ personId: peopleReferences.personId })
            .from(peopleReferences)
            .where(
              and(
                eq(peopleReferences.userId, ctx.userId),
                eq(peopleReferences.fromType, fromType),
                eq(peopleReferences.fromId, fromId)
              )
            )
        ).map((r) => r.personId);

        const desired = Array.from(new Set([...existing, ...newIds]));
        await reconcilePersonReferencesForUser(ctx.userId, fromType, fromId, desired);

        return {
          ok: true,
          id: `link:${fromType}:${fromId}`,
          receipt: {
            from_type: fromType,
            from_id: fromId,
            linked: resolved.map((r) => ({
              id: r.id,
              name: r.name,
              created: r.created,
            })),
          },
        };
      } catch (err) {
        // fromId is a uuid column; linking to a GCal event (non-uuid id) will
        // fail here. Surface as a validation error rather than throwing.
        return {
          ok: false,
          kind: "validation",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}
