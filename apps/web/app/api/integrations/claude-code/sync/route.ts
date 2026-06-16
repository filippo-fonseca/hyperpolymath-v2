import { NextResponse } from "next/server";
import { createPublicKey, createHash, verify, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { claudeCodeUsage, claudeSubscriptionUsage } from "@/lib/db/schema";

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

function pemFromEnv(raw: string): string {
  // .env.local stores the PEM as a single-line string with literal \n
  // escapes. Restore newlines before passing to crypto.
  return raw.replace(/\\n/g, "\n").trim();
}

function eqBuffersConstantTime(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Local-cron ingest endpoint for Claude Code usage.
 *
 * The script at tools/claude-code-sync.mjs runs on the user's laptop on a
 * daily cron, executes `ccusage daily --json`, and POSTs the resulting
 * payload here. Stored in claude_code_usage and read by the Life tab.
 *
 * Auth: Bearer token. Set CLAUDE_SYNC_TOKEN on both the deployed server
 * and the laptop script. Body must include `user_id` (the laptop knows
 * which Hyperpolymath user it's syncing for; set in the script's config).
 *
 * Request:
 *   POST /api/integrations/claude-code/sync
 *   Authorization: Bearer <CLAUDE_SYNC_TOKEN>
 *   Content-Type: application/json
 *   Body: {
 *     user_id: string,                // Hyperpolymath users.id (UUID)
 *     days: [
 *       {
 *         date: "YYYY-MM-DD",
 *         inputTokens: number,
 *         outputTokens: number,
 *         cacheReadTokens: number,
 *         cacheCreationTokens: number,
 *         totalTokens: number,
 *         costUsd: number | null,
 *       },
 *       ...
 *     ]
 *   }
 *
 * Response: { upserted: number }
 */

interface DayPayload {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  costUsd?: number | null;
}

function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function toInt(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.round(v));
}

// cost USD float -> integer micros, or null when absent/non-finite.
function toMicros(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.round(v * 1_000_000)
    : null;
}

// nullable bigint token field (e.g. projection.totalTokens).
function toIntOrNull(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, Math.round(v));
}

// ISO datetime string -> Date, or null when absent/invalid.
function toDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface SessionPayload {
  bucketKey?: unknown;
  costUsd?: unknown;
  totalTokens?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  cacheReadTokens?: unknown;
  cacheCreationTokens?: unknown;
  windowStart?: unknown;
  windowEnd?: unknown;
  projectedCostUsd?: unknown;
  projectedTotalTokens?: unknown;
}

interface WeekPayload {
  weekStart?: unknown;
  costUsd?: unknown;
  totalTokens?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  cacheReadTokens?: unknown;
  cacheCreationTokens?: unknown;
}

export async function POST(req: Request) {
  const expected = process.env.CLAUDE_SYNC_TOKEN;
  const publicKeyRaw = process.env.CLAUDE_SYNC_PUBLIC_KEY;
  if (!expected) {
    return NextResponse.json(
      { error: "CLAUDE_SYNC_TOKEN not configured on server" },
      { status: 500 },
    );
  }
  if (!publicKeyRaw) {
    return NextResponse.json(
      { error: "CLAUDE_SYNC_PUBLIC_KEY not configured on server" },
      { status: 500 },
    );
  }

  // Gate 1: bearer token (defense in depth — bearer alone isn't sufficient).
  const auth = req.headers.get("authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!eqBuffersConstantTime(auth.slice(7), expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Read raw body BEFORE JSON.parse — signature is over the exact bytes
  // the client signed, not a re-serialized version.
  const rawBody = await req.text();

  // Gate 2: Ed25519 signature over `${timestamp}.${sha256(body)}` proves
  // the request came from a holder of the private key (your laptop). Server
  // never sees the private key — only the public key from env.
  const signatureB64 = req.headers.get("x-sync-signature");
  const timestamp = req.headers.get("x-sync-timestamp");
  if (!signatureB64 || !timestamp) {
    return NextResponse.json({ error: "missing signature" }, { status: 401 });
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    return NextResponse.json(
      { error: "stale signature (replay protection)" },
      { status: 401 },
    );
  }
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const signedPayload = `${timestamp}.${bodyHash}`;
  let signatureOk = false;
  try {
    const publicKey = createPublicKey(pemFromEnv(publicKeyRaw));
    signatureOk = verify(
      null,
      Buffer.from(signedPayload),
      publicKey,
      Buffer.from(signatureB64, "base64"),
    );
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const body = payload as {
    user_id?: unknown;
    days?: unknown;
    session?: unknown;
    weeks?: unknown;
  };

  if (typeof body.user_id !== "string" || body.user_id.length < 8) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }
  if (!Array.isArray(body.days)) {
    return NextResponse.json({ error: "days[] required" }, { status: 400 });
  }

  const rows: {
    userId: string;
    date: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    totalTokens: number;
    costUsd: number | null;
  }[] = [];
  for (const raw of body.days as DayPayload[]) {
    if (!raw || typeof raw !== "object" || !isYmd(raw.date)) continue;
    const inputTokens = toInt(raw.inputTokens);
    const outputTokens = toInt(raw.outputTokens);
    const cacheReadTokens = toInt(raw.cacheReadTokens);
    const cacheCreationTokens = toInt(raw.cacheCreationTokens);
    const totalTokens = toInt(raw.totalTokens) ||
      inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
    const costMicros =
      typeof raw.costUsd === "number" && Number.isFinite(raw.costUsd)
        ? Math.round(raw.costUsd * 1_000_000)
        : null;
    rows.push({
      userId: body.user_id,
      date: raw.date,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      totalTokens,
      costUsd: costMicros,
    });
  }

  if (rows.length > 0) {
    await db
      .insert(claudeCodeUsage)
      .values(rows)
      .onConflictDoUpdate({
        target: [claudeCodeUsage.userId, claudeCodeUsage.date],
        set: {
          inputTokens: sql`excluded.input_tokens`,
          outputTokens: sql`excluded.output_tokens`,
          cacheReadTokens: sql`excluded.cache_read_tokens`,
          cacheCreationTokens: sql`excluded.cache_creation_tokens`,
          totalTokens: sql`excluded.total_tokens`,
          costUsd: sql`excluded.cost_usd_micros`,
          syncedAt: new Date(),
        },
      });
  }

  // Subscription snapshots (260616-g0y, DEC-2). Optional in the body — a
  // malformed session/weeks payload must never 500 the daily path, so each
  // upsert is wrapped and counts default to 0.
  let sessionUpserted = 0;
  let weeksUpserted = 0;

  const subSet = {
    costUsd: sql`excluded.cost_usd_micros`,
    totalTokens: sql`excluded.total_tokens`,
    inputTokens: sql`excluded.input_tokens`,
    outputTokens: sql`excluded.output_tokens`,
    cacheReadTokens: sql`excluded.cache_read_tokens`,
    cacheCreationTokens: sql`excluded.cache_creation_tokens`,
    windowStart: sql`excluded.window_start`,
    windowEnd: sql`excluded.window_end`,
    projectedCostUsd: sql`excluded.projected_cost_usd_micros`,
    projectedTotalTokens: sql`excluded.projected_total_tokens`,
    syncedAt: new Date(),
  };

  try {
    const session = body.session as SessionPayload | null | undefined;
    if (
      session &&
      typeof session === "object" &&
      typeof session.bucketKey === "string" &&
      session.bucketKey.length > 0
    ) {
      const inputTokens = toInt(session.inputTokens);
      const outputTokens = toInt(session.outputTokens);
      const cacheReadTokens = toInt(session.cacheReadTokens);
      const cacheCreationTokens = toInt(session.cacheCreationTokens);
      const totalTokens =
        toInt(session.totalTokens) ||
        inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
      await db
        .insert(claudeSubscriptionUsage)
        .values({
          userId: body.user_id,
          kind: "session",
          bucketKey: session.bucketKey,
          costUsd: toMicros(session.costUsd),
          totalTokens,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
          windowStart: toDate(session.windowStart),
          windowEnd: toDate(session.windowEnd),
          projectedCostUsd: toMicros(session.projectedCostUsd),
          projectedTotalTokens: toIntOrNull(session.projectedTotalTokens),
        })
        .onConflictDoUpdate({
          target: [
            claudeSubscriptionUsage.userId,
            claudeSubscriptionUsage.kind,
            claudeSubscriptionUsage.bucketKey,
          ],
          set: subSet,
        });
      sessionUpserted = 1;
    }
  } catch {
    // best-effort — never fail the daily path on a malformed session.
  }

  try {
    if (Array.isArray(body.weeks)) {
      const weekRows: {
        userId: string;
        kind: "week";
        bucketKey: string;
        costUsd: number | null;
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheCreationTokens: number;
      }[] = [];
      for (const raw of body.weeks as WeekPayload[]) {
        if (!raw || typeof raw !== "object" || !isYmd(raw.weekStart)) continue;
        const inputTokens = toInt(raw.inputTokens);
        const outputTokens = toInt(raw.outputTokens);
        const cacheReadTokens = toInt(raw.cacheReadTokens);
        const cacheCreationTokens = toInt(raw.cacheCreationTokens);
        const totalTokens =
          toInt(raw.totalTokens) ||
          inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;
        weekRows.push({
          userId: body.user_id,
          kind: "week",
          bucketKey: raw.weekStart,
          costUsd: toMicros(raw.costUsd),
          totalTokens,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheCreationTokens,
        });
      }
      if (weekRows.length > 0) {
        await db
          .insert(claudeSubscriptionUsage)
          .values(weekRows)
          .onConflictDoUpdate({
            target: [
              claudeSubscriptionUsage.userId,
              claudeSubscriptionUsage.kind,
              claudeSubscriptionUsage.bucketKey,
            ],
            set: subSet,
          });
        weeksUpserted = weekRows.length;
      }
    }
  } catch {
    // best-effort — never fail the daily path on malformed weeks.
  }

  return NextResponse.json({
    upserted: rows.length,
    sessionUpserted,
    weeksUpserted,
  });
}
