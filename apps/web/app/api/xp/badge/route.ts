/**
 * GET /api/xp/badge — the small XP payload: level, progress, streak, and the
 * most recent award.
 *
 * Deliberately cheap. It is refetched on every realtime XP event from every
 * mounted surface, so it must never touch the full ledger the way
 * /api/xp/overview does.
 *
 * Read-only and session-scoped: the user id comes from the session cookie,
 * never from the request.
 */

import { NextResponse } from "next/server";
import { getUserIdOrRedirect } from "@/lib/auth/get-user";
import { getXpBadge } from "@/lib/db/queries/xp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getUserIdOrRedirect();
  return NextResponse.json(await getXpBadge(userId));
}
