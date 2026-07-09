/**
 * POST /api/briefing/refresh — force a fresh briefing for the owner.
 *
 * Auth: Supabase getClaims() -> claims.sub (401 if missing). Owner-gated: the
 * caller's email must equal GITHUB_ISSUE_USER_EMAIL (looked up in the users
 * table by id). An unset env var or any mismatch is a hard 403 — briefing
 * generation is an owner-only, cost-bearing operation.
 *
 * Node runtime (Drizzle + gpt-4o-mini curation). If curation is unconfigured
 * (no OPENAI_API_KEY) the thrown error is mapped to a 503.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { runBriefingRefresh } from "@/lib/briefing/refresh";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims?.sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = claimsData.claims.sub as string;

  // Owner gate: the caller must be the configured owner (by email). Unset env
  // or mismatch is never treated as allowed.
  const ownerEmail = process.env.GITHUB_ISSUE_USER_EMAIL;
  if (!ownerEmail) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (rows[0]?.email !== ownerEmail) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await runBriefingRefresh(userId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("OPENAI_API_KEY")) {
      return NextResponse.json(
        { error: "briefing curation is not configured (OPENAI_API_KEY missing)" },
        { status: 503 },
      );
    }
    throw err;
  }
}
