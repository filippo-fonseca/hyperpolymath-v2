/**
 * /api/cron/briefing — daily Vercel cron that generates the owner's briefing.
 *
 * Security structure mirrors /api/cron/captures-to-issues EXACTLY:
 *   LAYER 1 AUTH: constant-time Bearer CRON_SECRET check (node:crypto
 *     timingSafeEqual, length-guarded), fails closed (401) before any DB work;
 *     405 on non-GET.
 *   LAYER 2 ONCE-PER-DAY LOCK: insert into cron_runs with onConflictDoNothing on
 *     the (job_name, run_date) UNIQUE index; an empty return means we already ran
 *     today, so we stop with { status: "already-ran" }.
 *   LAYER 3 OWNER RESOLUTION: the target user is resolved at runtime from
 *     GITHUB_ISSUE_USER_EMAIL (never hardcoded). Unset or no match is a no-op.
 *
 * Runtime: Node (Drizzle + gpt-4o-mini curation + node:crypto). maxDuration 300.
 */

import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { cronRuns, users } from "@/lib/db/schema";
import { runBriefingRefresh } from "@/lib/briefing/refresh";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const JOB_NAME = "briefing";

export async function GET(req: Request) {
  // ===== LAYER 1: AUTH =====
  if (req.method !== "GET") {
    return NextResponse.json({ error: "method not allowed" }, { status: 405 });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Misconfig: fail closed. A missing secret never means open.
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 401 },
    );
  }
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const provided = Buffer.from(authHeader);
  const expectedBuf = Buffer.from(expected);
  // timingSafeEqual throws on unequal Buffer lengths, so length-guard first.
  if (
    provided.length !== expectedBuf.length ||
    !timingSafeEqual(provided, expectedBuf)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // ===== END LAYER 1 =====

  // ===== LAYER 2: ONCE-PER-DAY LOCK =====
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const lock = await db
    .insert(cronRuns)
    .values({ jobName: JOB_NAME, runDate: today, status: "running" })
    .onConflictDoNothing({ target: [cronRuns.jobName, cronRuns.runDate] })
    .returning({ id: cronRuns.id });
  if (lock.length === 0) {
    return NextResponse.json({ status: "already-ran" });
  }
  const runId = lock[0].id;
  // ===== END LAYER 2 =====

  // ===== LAYER 3: OWNER RESOLUTION =====
  // Resolve the target user AT RUNTIME from GITHUB_ISSUE_USER_EMAIL. The email
  // is NEVER hardcoded (public/OSS repo). Unset or no match is a no-op.
  const ownerEmail = process.env.GITHUB_ISSUE_USER_EMAIL;
  if (!ownerEmail) {
    await finalizeRun(runId, "skipped-no-user");
    return NextResponse.json({ status: "skipped-no-user" });
  }
  const ownerRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ownerEmail))
    .limit(1);
  if (ownerRows.length === 0) {
    await finalizeRun(runId, "skipped-no-user");
    return NextResponse.json({ status: "skipped-no-user" });
  }
  const ownerId = ownerRows[0].id;
  // ===== END LAYER 3 =====

  try {
    const result = await runBriefingRefresh(ownerId);
    await finalizeRun(runId, "ok");
    return NextResponse.json({ status: "ok", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron briefing] refresh failed", message);
    await finalizeRun(runId, "error");
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}

// Finalize the cron_runs row for this invocation.
async function finalizeRun(runId: string, status: string): Promise<void> {
  await db
    .update(cronRuns)
    .set({ finishedAt: sql`now()`, status })
    .where(eq(cronRuns.id, runId));
}
