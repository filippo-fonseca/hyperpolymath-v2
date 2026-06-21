/**
 * /api/cron/wiki-backup — Vercel cron handler (Phase 28).
 *
 * Runs daily at `0 6 * * *` UTC per vercel.json (one hour after the 05:00
 * snapshot cron so the two never contend). Loops every row in `users`, builds
 * that user's Wiki as a markdown ZIP, and uploads it to their Google Drive.
 * Failures on one user do NOT abort the others (per-user independence; logged +
 * returned in the response body).
 *
 * Each user's backup file is dated in THEIR IANA timezone (`users.timezone`),
 * matching how the snapshot cron derives `snapshot_date`, so a 1 AM EDT firing
 * lands on the calendar day the user calls "today". Null timezone falls back to
 * UTC. One backup file per user per day; same-day re-runs overwrite in place.
 *
 * Users with zero Wiki pages are SKIPPED (no empty backup) and counted as
 * skipped rather than failed.
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
import { zipSync } from "fflate";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getPagesForUser } from "@/lib/db/queries/pages";
import { getFoldersForUser, getFolderProjects } from "@/lib/db/queries/folders";
import { buildPagesTree } from "@/lib/pages/tree";
import {
  buildTreeZip,
  type ExportablePage,
} from "@/lib/pages/markdown-export";
import { uploadWikiBackup } from "@/lib/gdrive/backup";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

interface Failure {
  userId: string;
  error: string;
}

/**
 * Today (YYYY-MM-DD) in the given IANA timezone. en-CA formats a Date as
 * `YYYY-MM-DD` natively. This mirrors the `todayInTimezone` helper that
 * `lib/context/persist.ts` uses to derive `snapshot_date`, so the wiki backup's
 * per-user date math matches the snapshot cron's.
 */
function todayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Pull every user. Single-user MVP — but the loop shape is
  // forward-compatible with the multi-user future. Failures per user are
  // independent.
  const allUsers = await db
    .select({ id: users.id, timezone: users.timezone })
    .from(users);

  let backupsWritten = 0;
  let skipped = 0;
  const failures: Failure[] = [];

  for (const { id, timezone } of allUsers) {
    try {
      const [pages, folders, folderProjects] = await Promise.all([
        getPagesForUser(id),
        getFoldersForUser(id),
        getFolderProjects(id),
      ]);

      // No pages = nothing to back up. Skip the upload (no empty backup) and
      // count it as skipped, not a failure.
      if (pages.length === 0) {
        skipped++;
        continue;
      }

      const tree = buildPagesTree(folders, folderProjects, pages);
      const exportablePages: ExportablePage[] = pages.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
      }));
      const files = buildTreeZip(tree, exportablePages);
      const bytes = zipSync(files);

      // Date the file in the user's own timezone (UTC when null), so a backup
      // lands on the calendar day the user calls "today".
      const date = timezone
        ? todayInTimezone(timezone)
        : new Date().toISOString().slice(0, 10);
      const fileName = `wiki-backup-${date}.zip`;

      await uploadWikiBackup(id, fileName, bytes);
      backupsWritten++;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "wiki backup failed";
      console.error("[cron wiki-backup] backup failed", {
        userId: id,
        error: message,
      });
      failures.push({ userId: id, error: message });
      continue;
    }
  }

  return NextResponse.json({
    ok: true,
    backups_written: backupsWritten,
    skipped,
    failures,
  });
}
