/**
 * POST /api/jarvis/morning-dump — Morning Dump parse + commit (issues #32/#33).
 *
 * A NEW, self-contained surface for rapid daily planning. Two modes:
 *
 *   mode: "parse"  — Dry-run. Send the free-form brain-dump to JARVIS and get
 *                    back a PROPOSED plan (tasks / events / captures). NOTHING
 *                    is written. The client renders this for review + edit.
 *
 *   mode: "commit" — Execute a client-reviewed list of plan items through the
 *                    SAME executor the live console uses (createServerExecutor).
 *                    Each item is re-validated server-side before it lands.
 *
 * Reuse without modification: this route imports the existing Anthropic client,
 * the jarvis-core tool schemas, the parse helper, and createServerExecutor. It
 * does NOT touch the console/undo files or run-turn.ts.
 *
 * INVARIANTS (mirror run-turn.ts / executor.ts):
 *   - Node runtime (executor needs googleapis + postgres-js + drizzle).
 *   - getClaims() for auth — userId re-derived at the boundary, never trusted
 *     from the body.
 */

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createServerExecutor } from "@/lib/jarvis/executor";
import { type MorningDumpItem, parseMorningDump } from "@/lib/jarvis/morning-dump";
import { createClient } from "@/lib/supabase/server";
import { zCreateCaptureFor, zCreateEventFor, zCreateTaskFor } from "@hyperpolymath/jarvis-core";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_TZ = "America/New_York";

function buildTemporalContext(tz: string): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
    timeZoneName: "longOffset",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const offset = get("timeZoneName").replace("GMT", "") || "+00:00";
  const local = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  return [
    "CURRENT USER TIME:",
    `- Local now: ${local} (${get("weekday")})`,
    `- Timezone: ${tz} (UTC${offset})`,
    `- Date due/start/end timestamps with this UTC offset (e.g. ${local}:00${offset}), never a bare Z/UTC value. "this morning", "today", "tomorrow" are relative to the local time above.`,
  ].join("\n");
}

interface ParseBody {
  mode: "parse";
  dump: string;
}

interface CommitBody {
  mode: "commit";
  items: MorningDumpItem[];
}

type RequestBody = ParseBody | CommitBody;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const claimsResult = await supabase.auth.getClaims();
  if (claimsResult.error || !claimsResult.data?.claims?.sub) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = claimsResult.data.claims.sub;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userRow = (
    await db
      .select({
        timezone: users.timezone,
        defaultCalendarId: users.gcalDefaultCalendarId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
  )[0];
  const tz = userRow?.timezone ?? DEFAULT_TZ;

  if (body.mode === "parse") {
    const dump = typeof body.dump === "string" ? body.dump.trim() : "";
    if (dump.length === 0) {
      return Response.json({ error: "Empty dump" }, { status: 400 });
    }
    try {
      const plan = await parseMorningDump({
        dump,
        temporalContext: buildTemporalContext(tz),
        abortSignal: req.signal,
      });
      return Response.json(plan);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ error: message }, { status: 500 });
    }
  }

  if (body.mode === "commit") {
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return Response.json({ error: "Nothing to commit" }, { status: 400 });
    }

    const executor = createServerExecutor();
    const ctx = {
      userId,
      source: { device: "Web", input: "text" as const },
      userTimezone: tz,
      defaultCalendarId: userRow?.defaultCalendarId ?? null,
      preValidatedProjectIds: new Set<string>(),
    };

    const taskValidator = zCreateTaskFor({ voiceActive: false });
    const eventValidator = zCreateEventFor({ voiceActive: false });
    const captureValidator = zCreateCaptureFor({ voiceActive: false });

    const results: Array<{ kind: string; result: unknown }> = [];
    for (const item of items) {
      try {
        if (item.kind === "task") {
          const parsed = taskValidator.safeParse(item.input);
          if (!parsed.success) {
            results.push({ kind: "task", result: { ok: false, error: "invalid" } });
            continue;
          }
          results.push({
            kind: "task",
            result: await executor.createTask(
              parsed.data as Parameters<typeof executor.createTask>[0],
              ctx
            ),
          });
        } else if (item.kind === "event") {
          const parsed = eventValidator.safeParse(item.input);
          if (!parsed.success) {
            results.push({ kind: "event", result: { ok: false, error: "invalid" } });
            continue;
          }
          results.push({
            kind: "event",
            result: await executor.createEvent(
              parsed.data as Parameters<typeof executor.createEvent>[0],
              ctx
            ),
          });
        } else if (item.kind === "capture") {
          const parsed = captureValidator.safeParse(item.input);
          if (!parsed.success) {
            results.push({ kind: "capture", result: { ok: false, error: "invalid" } });
            continue;
          }
          results.push({
            kind: "capture",
            result: await executor.createCapture(
              parsed.data as Parameters<typeof executor.createCapture>[0],
              ctx
            ),
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ kind: item.kind, result: { ok: false, error: message } });
      }
    }

    const committed = results.filter(
      (r) => (r.result as { ok?: boolean } | null)?.ok === true
    ).length;
    return Response.json({ committed, total: items.length, results });
  }

  return Response.json({ error: "Unknown mode" }, { status: 400 });
}
