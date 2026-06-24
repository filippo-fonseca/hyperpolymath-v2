/**
 * /api/cron/snapshot-context — Vercel cron handler.
 *
 * Phase 999.12 CTX-06 / CTX-07. Runs nightly at `0 5 * * *` UTC per
 * vercel.json (Vercel cron is UTC-only). Loops every row in `users` and
 * rebuilds + persists a snapshot for each — failures on one user do NOT abort
 * the others (per-user independence; logged + returned in the response body).
 *
 * Each user's `snapshot_date` is computed in **their** IANA timezone
 * (`users.timezone`), so a row from a 1 AM EDT firing lands on the calendar
 * day the user calls "today". Users with a null `timezone` fall back to UTC.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`. The env var is REQUIRED in
 * production — a missing CRON_SECRET returns 500 rather than 401 so we fail
 * loud on misconfig instead of letting unauthenticated traffic through.
 *
 * Runtime: Node (NOT Edge). The MCP SDK has Node-only deps, and our snapshot
 * loaders use Drizzle + postgres driver which require the Node runtime.
 * maxDuration=60 covers the per-user loop's worst-case for v1's single user.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { buildSnapshot } from "@/lib/context/build-snapshot";
import { persistSnapshot } from "@/lib/context/persist";
import { constantTimeEqual } from "@/lib/auth/constant-time";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface Failure {
  userId: string;
  error: string;
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (!constantTimeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Pull every user. Single-user MVP — but the loop shape is
  // forward-compatible with the multi-user future. Failures per user are
  // independent.
  const allUsers = await db
    .select({ id: users.id, timezone: users.timezone })
    .from(users);

  let written = 0;
  const failures: Failure[] = [];

  for (const { id, timezone } of allUsers) {
    const built = await buildSnapshot(id);
    if (!built.ok) {
      console.error("[cron snapshot] build failed", { userId: id, error: built.error });
      failures.push({ userId: id, error: built.error });
      continue;
    }
    const persisted = await persistSnapshot(id, built.data, {
      userTimezone: timezone,
    });
    if (!persisted.ok) {
      console.error("[cron snapshot] persist failed", { userId: id, error: persisted.error });
      failures.push({ userId: id, error: persisted.error });
      continue;
    }
    written++;
  }

  return NextResponse.json({
    ok: true,
    snapshots_written: written,
    failures,
  });
}
