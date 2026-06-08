import { NextResponse } from "next/server";
import { createPublicKey, createHash, verify, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { claudeCodeUsage } from "@/lib/db/schema";

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
  const body = payload as { user_id?: unknown; days?: unknown };

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

  if (rows.length === 0) {
    return NextResponse.json({ upserted: 0 });
  }

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

  return NextResponse.json({ upserted: rows.length });
}
