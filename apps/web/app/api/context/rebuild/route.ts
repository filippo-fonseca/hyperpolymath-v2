/**
 * /api/context/rebuild — manual "rebuild now" target for the authenticated user.
 *
 * Phase 999.12 CTX-08 backing endpoint. The /settings/context page (Plan 05)
 * exposes a button that hits this route to force a fresh snapshot for the
 * caller without waiting for the nightly cron.
 *
 * Auth: Supabase session via `getClaims()` (CLAUDE.md Critical Pattern 1 —
 * `getSession()` in server code is spoofable and forbidden). The userId is
 * extracted from `claims.sub` so the route only ever rebuilds the caller's
 * own snapshot — no cross-user vector.
 *
 * Runtime: Node (NOT Edge) — same constraints as the cron route.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { buildSnapshot } from "@/lib/context/build-snapshot";
import { persistSnapshot } from "@/lib/context/persist";
import { checkRateLimit } from "@/lib/ratelimit/in-memory";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims?.sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = claimsData.claims.sub as string;

  // Snapshot rebuild is heavy owner-DB work; cap how often a user can force it.
  const rl = checkRateLimit(`context-rebuild:${userId}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const built = await buildSnapshot(userId);
  if (!built.ok) {
    return NextResponse.json(
      { ok: false, error: built.error },
      { status: 500 },
    );
  }

  const tzRow = await db
    .select({ tz: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const userTimezone = tzRow[0]?.tz ?? null;

  const persisted = await persistSnapshot(userId, built.data, { userTimezone });
  if (!persisted.ok) {
    return NextResponse.json(
      { ok: false, error: persisted.error },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    snapshotDate: persisted.data.snapshotDate,
    meta: built.data.meta,
  });
}
