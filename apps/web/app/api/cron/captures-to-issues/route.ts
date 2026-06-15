/**
 * /api/cron/captures-to-issues (260615-h74). Daily Vercel cron handler.
 *
 * Reads the owner-user's captures tagged "hyperpolymath", runs each genuinely
 * actionable, public-safe one through the issue spec'er, and files it as a
 * GitHub issue on a public repo. Idempotent (once-per-day DB lock), bounded
 * (25 per run), and auditable.
 *
 * FOUR ORDERED SECURITY LAYERS (see the "===== LAYER N =====" banners below;
 * each is self-contained so a human can audit it in isolation):
 *   LAYER 1 AUTH: constant-time Bearer CRON_SECRET check (node:crypto
 *     timingSafeEqual, length-guarded), fails closed (401) BEFORE any DB query,
 *     env user lookup, or Anthropic call; 405 on non-GET.
 *   LAYER 2 ONCE-PER-DAY LOCK: insert into cron_runs with onConflictDoNothing
 *     on the (job_name, run_date) UNIQUE index; an empty return means we already
 *     ran today, so we stop with { status: "already-ran" }.
 *   LAYER 3 PER-RUN CAP: at most PER_RUN_CAP captures per run, oldest first
 *     (enforced by .limit in Layer 4's query).
 *   LAYER 4 ELIGIBILITY: only the user whose email equals
 *     GITHUB_ISSUE_USER_EMAIL is ever processed (never hardcoded; unset or no
 *     match is a no-op). noExport captures are hard-skipped. Only captures with
 *     github_evaluated_at IS NULL and the hyperpolymath hashtag are loaded.
 *
 * LOCKED DECISIONS: cap = 25; schedule "0 6 * * *" (see vercel.json); native
 * fetch (no Octokit, no new deps); owner email via env var.
 *
 * Runtime: Node (Drizzle + postgres driver + node:crypto). maxDuration 60.
 */

import { NextResponse } from "next/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { captures, capturesHashtags, hashtags, users, cronRuns } from "@/lib/db/schema";
import { specCaptureAsIssue } from "@/lib/jarvis/issue-specer";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const PER_RUN_CAP = 25;
const JOB_NAME = "captures-to-issues";
const HASHTAG_NAME = "hyperpolymath";
const DEFAULT_REPO = "filippo-fonseca/hyperpolymath-v2";
const KIWI_LABEL = "kiwi-drafted";

export async function GET(req: Request) {
  // ===== LAYER 1: AUTH =====
  // Runs BEFORE any DB query, env user lookup, or Anthropic call.
  // A missing CRON_SECRET is NEVER treated as "open": we fail closed.
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
  // A length mismatch is treated as unauthorized without calling it.
  if (
    provided.length !== expectedBuf.length ||
    !timingSafeEqual(provided, expectedBuf)
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // ===== END LAYER 1 =====

  // ===== LAYER 2: ONCE-PER-DAY LOCK =====
  // The (job_name, run_date) UNIQUE constraint is the lock (race-safe at the
  // DB, not an app-level check). Today's date is computed in UTC; Vercel cron
  // fires in UTC.
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const lock = await db
    .insert(cronRuns)
    .values({ jobName: JOB_NAME, runDate: today, status: "running" })
    .onConflictDoNothing({ target: [cronRuns.jobName, cronRuns.runDate] })
    .returning({ id: cronRuns.id });
  if (lock.length === 0) {
    // Conflict: a row for (JOB_NAME, today) already exists, so we already ran.
    return NextResponse.json({ status: "already-ran" });
  }
  const runId = lock[0].id;
  // ===== END LAYER 2 =====

  // ===== LAYER 3: PER-RUN CAP =====
  // At most PER_RUN_CAP (25) captures are processed per run, oldest first; the
  // rest wait for tomorrow's run. Enforced by the .limit on the Layer 4 query.
  // ===== END LAYER 3 =====

  // ===== LAYER 4: ELIGIBILITY =====
  // Resolve the target user AT RUNTIME from GITHUB_ISSUE_USER_EMAIL. The email
  // is NEVER hardcoded (public/OSS repo). An unset env var or no match is a
  // no-op: we never process any other user.
  const ownerEmail = process.env.GITHUB_ISSUE_USER_EMAIL;
  if (!ownerEmail) {
    await finalizeRun(runId, "skipped-no-user");
    return NextResponse.json({ processed: 0, issued: 0, skipped: 0, errors: 0 });
  }
  const ownerRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ownerEmail))
    .limit(1);
  if (ownerRows.length === 0) {
    await finalizeRun(runId, "skipped-no-user");
    return NextResponse.json({ processed: 0, issued: 0, skipped: 0, errors: 0 });
  }
  const ownerId = ownerRows[0].id;

  // Eligible captures: owner's, NOT noExport (hard skip; never loaded or sent
  // to Claude), not yet evaluated, tagged with the canonical lowercase
  // "hyperpolymath" hashtag. Oldest first, capped at PER_RUN_CAP.
  const eligible = await db
    .select({ id: captures.id, content: captures.content })
    .from(captures)
    .innerJoin(
      capturesHashtags,
      and(
        eq(capturesHashtags.captureId, captures.id),
        eq(capturesHashtags.userId, ownerId),
      ),
    )
    .innerJoin(
      hashtags,
      and(
        eq(hashtags.id, capturesHashtags.hashtagId),
        eq(hashtags.userId, ownerId),
        eq(hashtags.name, HASHTAG_NAME),
      ),
    )
    .where(
      and(
        eq(captures.userId, ownerId),
        eq(captures.noExport, false),
        isNull(captures.githubEvaluatedAt),
      ),
    )
    .orderBy(asc(captures.createdAt))
    .limit(PER_RUN_CAP);
  // ===== END LAYER 4 =====

  // GitHub credentials. A missing token is a no-op (do not call GitHub blind).
  const repo = process.env.GITHUB_ISSUE_REPO || DEFAULT_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    await finalizeRun(runId, "skipped-no-token");
    return NextResponse.json({ processed: 0, issued: 0, skipped: 0, errors: 0 });
  }

  let processed = 0;
  let issued = 0;
  let skipped = 0;
  let errors = 0;

  for (const capture of eligible) {
    // Per-capture isolation: one failure never aborts the run.
    try {
      const decision = await specCaptureAsIssue(capture.content);

      let issueUrl: string | null = null;
      if (decision.actionable) {
        // Ensure the kiwi-drafted label is always present.
        const labels = decision.labels.includes(KIWI_LABEL)
          ? decision.labels
          : [...decision.labels, KIWI_LABEL];

        const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "hyperpolymath-cron",
          },
          body: JSON.stringify({
            title: decision.title,
            body: decision.body,
            labels,
          }),
        });
        if (!res.ok) {
          throw new Error(`GitHub issue create failed: ${res.status}`);
        }
        const created: unknown = await res.json();
        if (
          created &&
          typeof created === "object" &&
          "html_url" in created &&
          typeof (created as { html_url: unknown }).html_url === "string"
        ) {
          issueUrl = (created as { html_url: string }).html_url;
        }
      }

      // PERSISTENCE: always mark evaluated (issued OR skipped) so the capture
      // is never re-evaluated. Set the URL only when an issue was created.
      await db
        .update(captures)
        .set({
          githubEvaluatedAt: sql`now()`,
          ...(issueUrl ? { githubIssueUrl: issueUrl } : {}),
        })
        .where(eq(captures.id, capture.id));

      processed++;
      if (decision.actionable) {
        issued++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors++;
      console.error("[cron captures-to-issues] capture failed", {
        captureId: capture.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Still attempt to mark evaluated so a persistently failing capture does
      // not block the run forever. If this mark itself fails, swallow it.
      try {
        await db
          .update(captures)
          .set({ githubEvaluatedAt: sql`now()` })
          .where(eq(captures.id, capture.id));
      } catch (markErr) {
        console.error("[cron captures-to-issues] evaluated-mark failed", {
          captureId: capture.id,
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
    }
  }

  await finalizeRun(runId, errors > 0 ? "partial" : "ok");
  return NextResponse.json({ processed, issued, skipped, errors });
}

// Finalize the cron_runs row for this invocation.
async function finalizeRun(runId: string, status: string): Promise<void> {
  await db
    .update(cronRuns)
    .set({ finishedAt: sql`now()`, status })
    .where(eq(cronRuns.id, runId));
}
