/**
 * POST /api/dev/trigger-captures-to-issues
 *
 * Manual trigger for the captures-to-issues pipeline that normally runs as a
 * daily Vercel cron (/api/cron/captures-to-issues). Runs the same extraction
 * logic on demand, bypassing the once-per-day idempotency lock so the owner
 * can fire it outside the cron window.
 *
 * Auth: Supabase session (getClaims) + isOwnerUser check. Owner-only; any
 * other authenticated user gets 403. Unauthenticated gets 401.
 *
 * Rate-limited to 3 calls per minute (in-memory; best-effort per Vercel
 * instance) to prevent accidental hammering of the Anthropic + GitHub APIs.
 *
 * Runtime: Node (Drizzle + postgres driver + Anthropic SDK). maxDuration 300.
 */

import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { isOwnerUser } from "@/lib/auth/owner";
import { checkRateLimit } from "@/lib/ratelimit/in-memory";
import { db } from "@/lib/db";
import { captures, capturesHashtags, hashtags, users } from "@/lib/db/schema";
import { specCaptureAsIssue } from "@/lib/jarvis/issue-specer";
import { reconcileResolvedIssues } from "@/lib/jarvis/issue-reconciler";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const PER_RUN_CAP = 25;
const HASHTAG_NAME = "hyperpolymath";
const DEFAULT_REPO = "filippo-fonseca/hyperpolymath-v2";
const KIWI_LABEL = "kiwi-drafted";
const ISSUE_FOOTER = "\n\n---\n_Automatically generated from Filippo's notes._";
const CONCURRENCY = 6;

type CaptureOutcome = "issued" | "skipped" | "error" | "deferred";

export async function POST() {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims?.sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = claimsData.claims.sub as string;

  if (!(await isOwnerUser(userId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rl = checkRateLimit(`trigger-captures-to-issues:${userId}`, {
    limit: 3,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const ownerEmail = process.env.GITHUB_ISSUE_USER_EMAIL;
  if (!ownerEmail) {
    return NextResponse.json(
      { ok: false, error: "GITHUB_ISSUE_USER_EMAIL not configured" },
      { status: 500 },
    );
  }

  const ownerRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ownerEmail))
    .limit(1);
  if (ownerRows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "owner user not found" },
      { status: 500 },
    );
  }
  const ownerId = ownerRows[0].id;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "GITHUB_TOKEN not configured" },
      { status: 500 },
    );
  }

  const repo = process.env.GITHUB_ISSUE_REPO || DEFAULT_REPO;

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

  const outcomes = await mapWithConcurrency(eligible, CONCURRENCY, (capture) =>
    processCapture(capture, repo, token),
  );

  const issued = outcomes.filter((o) => o === "issued").length;
  const skipped = outcomes.filter((o) => o === "skipped").length;
  const errors = outcomes.filter((o) => o === "error").length;
  const deferred = outcomes.filter((o) => o === "deferred").length;
  const processed = issued + skipped + errors;

  let autoClosed = 0;
  try {
    const rec = await reconcileResolvedIssues({ token, repo });
    autoClosed = rec.closed;
  } catch (err) {
    console.error("[trigger-captures-to-issues] reconcile failed", err);
  }

  return NextResponse.json({ ok: true, processed, issued, skipped, errors, deferred, autoClosed });
}

async function processCapture(
  capture: { id: string; content: string },
  repo: string,
  token: string,
): Promise<CaptureOutcome> {
  let markEvaluated = true;
  let issueUrl: string | null = null;
  let outcome: CaptureOutcome = "skipped";
  try {
    const decision = await specCaptureAsIssue(capture.content);

    if (decision.actionable) {
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
          "User-Agent": "hyperpolymath-manual-trigger",
        },
        body: JSON.stringify({
          title: decision.title,
          body: `${decision.body}${ISSUE_FOOTER}`,
          labels,
        }),
      });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          markEvaluated = false;
        }
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
      outcome = "issued";
    } else {
      outcome = "skipped";
    }
  } catch (err) {
    if (err instanceof TypeError) {
      markEvaluated = false;
    }
    console.error("[trigger-captures-to-issues] capture failed", {
      captureId: capture.id,
      transient: !markEvaluated,
      error: err instanceof Error ? err.message : String(err),
    });
    outcome = "error";
  }

  if (!markEvaluated) {
    return "deferred";
  }

  try {
    await db
      .update(captures)
      .set({
        githubEvaluatedAt: sql`now()`,
        ...(issueUrl ? { githubIssueUrl: issueUrl } : {}),
      })
      .where(eq(captures.id, capture.id));
  } catch (markErr) {
    console.error("[trigger-captures-to-issues] evaluated-mark failed", {
      captureId: capture.id,
      error: markErr instanceof Error ? markErr.message : String(markErr),
    });
  }
  return outcome;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function runNext(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;
    results[index] = await worker(items[index]);
    return runNext();
  }
  const starters = Array.from(
    { length: Math.min(limit, items.length) },
    () => runNext(),
  );
  await Promise.all(starters);
  return results;
}
