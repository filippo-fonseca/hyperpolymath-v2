/**
 * POST /api/dev-runs (260615-lkl). Ingest endpoint for the local Kiwi auto-dev
 * worker's daily run summary.
 *
 * SINGLE WRITE PATH: this is the ONLY mutation site for kiwi_dev_runs rows. No
 * other code writes that table. The owner-only DEVELOPMENT tab on /insights only
 * reads.
 *
 * ORDERED LAYERS (audit each in isolation; all run before the upsert):
 *   1. AUTH: constant-time Bearer DEV_RUN_INGEST_SECRET check (node:crypto
 *      timingSafeEqual, length-guarded), fails closed (500 when the secret env is
 *      unset, 401 on mismatch) BEFORE any DB read/write or body parse; 405 on
 *      non-POST. Mirrors the captures-to-issues cron auth exactly.
 *   2. OWNER RESOLUTION: the target userId is resolved at runtime from
 *      GITHUB_ISSUE_USER_EMAIL via users.email; never hardcoded, never from the
 *      request body. Unset env or no match returns 500 and writes nothing.
 *   3. VALIDATION: Zod-validate the body (run date format, status enum, items
 *      shape) before any write; 400 on parse failure.
 *   4. UPSERT: insert ... onConflictDoUpdate on (user_id, run_date) so the daily
 *      POST overwrites that day's row.
 *
 * Runtime: Node (Drizzle + postgres driver + node:crypto).
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { kiwiDevRuns, users } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mirrors the shared DevRunItem shape (lib/db/queries/dev-runs.ts). Defaults
// keep the worker payload terse: a bare { issueNumber, title, status } is valid.
const devRunItemSchema = z.object({
  issueNumber: z.number(),
  title: z.string(),
  status: z.enum(["done", "skipped", "failed", "timed-out"]),
  branch: z.string().nullable().optional().default(null),
  branchUrl: z.string().nullable().optional().default(null),
  commitCount: z.number().default(0),
  note: z.string().nullable().optional().default(null),
});

const devRunBodySchema = z.object({
  runDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  startedAt: z.string().datetime().nullable().optional(),
  finishedAt: z.string().datetime().nullable().optional(),
  status: z.string().optional(),
  // Explicit counts are accepted but optional; they are derived from items when
  // absent (see below).
  issuesAttempted: z.number().optional(),
  issuesDone: z.number().optional(),
  issuesSkipped: z.number().optional(),
  issuesFailed: z.number().optional(),
  items: z.array(devRunItemSchema),
});

export async function POST(req: Request) {
  // ===== LAYER 1: AUTH =====
  // Runs BEFORE any DB query, owner lookup, or body parse. A missing secret is
  // NEVER treated as open: we fail closed.
  if (req.method !== "POST") {
    return NextResponse.json({ error: "method not allowed" }, { status: 405 });
  }
  const secret = process.env.DEV_RUN_INGEST_SECRET;
  if (!secret) {
    // Misconfig: fail closed. A missing secret never means open.
    return NextResponse.json(
      { error: "DEV_RUN_INGEST_SECRET not configured on server" },
      { status: 500 },
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

  // ===== LAYER 2: OWNER RESOLUTION =====
  // The target userId comes from env, never the request body. Unset env or no
  // match writes nothing.
  const ownerEmail = process.env.GITHUB_ISSUE_USER_EMAIL;
  if (!ownerEmail) {
    return NextResponse.json(
      { error: "GITHUB_ISSUE_USER_EMAIL not configured on server" },
      { status: 500 },
    );
  }
  const ownerRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ownerEmail))
    .limit(1);
  if (ownerRows.length === 0) {
    return NextResponse.json({ error: "owner user not found" }, { status: 500 });
  }
  const ownerId = ownerRows[0].id;
  // ===== END LAYER 2 =====

  // ===== LAYER 3: VALIDATION =====
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid body", details: "body is not valid JSON" },
      { status: 400 },
    );
  }
  const parsed = devRunBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const body = parsed.data;
  // ===== END LAYER 3 =====

  // Derive counts from items when the caller omits them. Explicit counts in the
  // body win when present.
  const items = body.items;
  const derivedDone = items.filter((i) => i.status === "done").length;
  const derivedSkipped = items.filter((i) => i.status === "skipped").length;
  const derivedFailed = items.filter(
    (i) => i.status === "failed" || i.status === "timed-out",
  ).length;
  const issuesAttempted = body.issuesAttempted ?? items.length;
  const issuesDone = body.issuesDone ?? derivedDone;
  const issuesSkipped = body.issuesSkipped ?? derivedSkipped;
  const issuesFailed = body.issuesFailed ?? derivedFailed;

  // The postgres-js driver accepts an ISO string or a Date for timestamptz.
  const startedAt = body.startedAt ? new Date(body.startedAt) : null;
  const finishedAt = body.finishedAt ? new Date(body.finishedAt) : null;
  const status = body.status ?? null;

  // ===== LAYER 4: UPSERT =====
  // One row per (userId, runDate); a same-day re-run overwrites that day's row.
  const upserted = await db
    .insert(kiwiDevRuns)
    .values({
      userId: ownerId,
      runDate: body.runDate,
      startedAt,
      finishedAt,
      status,
      issuesAttempted,
      issuesDone,
      issuesSkipped,
      issuesFailed,
      items,
    })
    .onConflictDoUpdate({
      target: [kiwiDevRuns.userId, kiwiDevRuns.runDate],
      set: {
        startedAt,
        finishedAt,
        status,
        issuesAttempted,
        issuesDone,
        issuesSkipped,
        issuesFailed,
        items,
      },
    })
    .returning({ id: kiwiDevRuns.id });
  // ===== END LAYER 4 =====

  return NextResponse.json({ ok: true, id: upserted[0]?.id });
}
