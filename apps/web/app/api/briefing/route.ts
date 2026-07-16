/**
 * GET /api/briefing — return the authenticated user's latest briefing edition.
 *
 * Auth: Supabase session via getClaims() (getSession() is spoofable in server
 * code and forbidden per CLAUDE.md). The userId is claims.sub, so a caller only
 * ever reads their own briefing.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLatestBriefing } from "@/lib/briefing/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  if (error || !claimsData?.claims?.sub) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = claimsData.claims.sub as string;

  return NextResponse.json(await getLatestBriefing(userId));
}
