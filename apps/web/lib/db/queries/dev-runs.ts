import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { kiwiDevRuns } from "@/lib/db/schema";

/**
 * 260615-lkl: dev-runs read layer + shared types.
 *
 * DevRunItem and DevRun are the single source of truth for the dev-run shape.
 * They are imported by the schema (kiwi_dev_runs items jsonb column type), the
 * ingest endpoint validator, and the DEVELOPMENT tab UI, so the shape is never
 * duplicated.
 *
 * getRecentDevRuns is read-only. The only write path for kiwi_dev_runs is the
 * token-gated POST /api/dev-runs endpoint.
 */

// One per-issue entry in a daily auto-dev run. prUrl and summary are optional so
// rows written before they existed still satisfy the type.
export type DevRunItem = {
  issueNumber: number;
  title: string;
  status: "done" | "skipped" | "failed" | "timed-out";
  branch: string | null;
  branchUrl: string | null;
  // Direct link to the opened review PR (distinct from branchUrl, which may be a
  // bare branch tree). Present once the worker opens a PR for the branch.
  prUrl?: string | null;
  // A few-sentence, commit-derived summary of the change, mirroring the PR body.
  summary?: string | null;
  commitCount: number;
  note: string | null;
};

// One daily auto-dev run row. runDate is a date column, so the postgres-js
// driver returns it as a YYYY-MM-DD string.
export type DevRun = {
  id: string;
  userId: string;
  runDate: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  status: string | null;
  issuesAttempted: number;
  issuesDone: number;
  issuesSkipped: number;
  issuesFailed: number;
  items: DevRunItem[];
  createdAt: Date;
};

// Most-recent auto-dev runs for the owner, newest-first. Caller is responsible
// for the owner gate (only the owner should ever call this).
export async function getRecentDevRuns(
  userId: string,
  limit = 14,
): Promise<DevRun[]> {
  const rows = await db
    .select({
      id: kiwiDevRuns.id,
      userId: kiwiDevRuns.userId,
      runDate: kiwiDevRuns.runDate,
      startedAt: kiwiDevRuns.startedAt,
      finishedAt: kiwiDevRuns.finishedAt,
      status: kiwiDevRuns.status,
      issuesAttempted: kiwiDevRuns.issuesAttempted,
      issuesDone: kiwiDevRuns.issuesDone,
      issuesSkipped: kiwiDevRuns.issuesSkipped,
      issuesFailed: kiwiDevRuns.issuesFailed,
      items: kiwiDevRuns.items,
      createdAt: kiwiDevRuns.createdAt,
    })
    .from(kiwiDevRuns)
    .where(eq(kiwiDevRuns.userId, userId))
    .orderBy(desc(kiwiDevRuns.runDate))
    .limit(limit);

  // The items column carries its DevRunItem[] type via the schema $type, so no
  // cast is needed here.
  return rows;
}
