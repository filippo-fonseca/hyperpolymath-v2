/**
 * /api/cron/wiki-backup — Vercel cron handler (Phase 28; per-user controls +
 * status added for issue #142).
 *
 * Runs daily at `0 7 * * *` UTC per vercel.json (after the 05:00 snapshot and
 * 06:00 captures crons so the three never contend). Loops every row in `users`
 * whose `pages_backup_enabled` is true, builds that user's Pages (Wiki) as a
 * markdown ZIP, and uploads it to their Google Drive. The actual per-user
 * gather→serialize→upload→record pipeline lives in `runPagesBackupForUser`
 * (shared with the manual "Back up now" Server Action), which NEVER throws for
 * an expected condition and records last-run status on the user row.
 *
 * Per-user independence: one user's backup outcome (including a hard error) can
 * never abort the others. Each result is tallied into the response body so a run
 * is auditable from the cron logs.
 *
 * Status tallies in the response:
 *   - ok               — a dated ZIP was written/updated in the user's Drive.
 *   - skipped_empty    — the user has no pages (no empty backup written).
 *   - not_connected    — no stored Google token (user must connect Google).
 *   - needs_drive_scope— token predates the drive.file scope; user must reconnect.
 *   - error            — any other failure (logged + listed in `failures`).
 *   - skipped_disabled — the user turned the daily backup off in /settings.
 *
 * Date math lives inside the runner (dates the file in the user's own timezone,
 * UTC when null), so a 1 AM-local firing lands on the calendar day the user
 * calls "today". Same-day re-runs overwrite the dated file in place.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`. A missing CRON_SECRET returns
 * 500 (fail loud on misconfig) rather than letting unauthenticated traffic
 * through.
 *
 * Runtime: Node (NOT Edge). The Drive upload uses node:stream and the loaders
 * use Drizzle + the postgres driver, all Node-only. maxDuration=60 covers the
 * per-user loop's worst-case for v1's single user.
 */

import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/auth/constant-time";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import {
  runPagesBackupForUser,
  type PagesBackupStatus,
} from "@/lib/gdrive/run-backup";

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

  // Pull every user with backups enabled. Single-user MVP — but the loop shape
  // is forward-compatible with the multi-user future. Failures per user are
  // independent (the runner records each user's status and never throws).
  const allUsers = await db
    .select({
      id: users.id,
      timezone: users.timezone,
      enabled: users.pagesBackupEnabled,
    })
    .from(users);

  // Tally counts per status, plus a collected list of hard failures.
  const counts: Record<PagesBackupStatus | "skipped_disabled", number> = {
    ok: 0,
    skipped_empty: 0,
    not_connected: 0,
    needs_drive_scope: 0,
    error: 0,
    skipped_disabled: 0,
  };
  const failures: Failure[] = [];

  for (const { id, timezone, enabled } of allUsers) {
    // Respect the per-user opt-out. A disabled user is skipped entirely (no
    // Google call, no status write) so toggling off truly pauses the cron.
    if (!enabled) {
      counts.skipped_disabled++;
      continue;
    }

    const result = await runPagesBackupForUser(id, { timezone });
    counts[result.status]++;
    if (result.status === "error" && result.error) {
      console.error("[cron wiki-backup] backup failed", {
        userId: id,
        error: result.error,
      });
      failures.push({ userId: id, error: result.error });
    }
  }

  return NextResponse.json({
    ok: true,
    backups_written: counts.ok,
    skipped_empty: counts.skipped_empty,
    skipped_disabled: counts.skipped_disabled,
    not_connected: counts.not_connected,
    needs_drive_scope: counts.needs_drive_scope,
    errors: counts.error,
    failures,
  });
}
