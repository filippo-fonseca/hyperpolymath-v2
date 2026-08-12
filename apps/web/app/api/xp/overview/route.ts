/**
 * GET /api/xp/overview — the profile XP dashboard payload.
 *
 * Exists so the client can refetch when realtime says an award landed. The
 * page itself is server-rendered and passes the same shape as initialData, so
 * this is only ever hit on invalidation, never on first paint.
 *
 * Read-only and scoped to the caller: the user id comes from the session, not
 * from the request.
 */

import { NextResponse } from "next/server";
import { getUserIdOrRedirect } from "@/lib/auth/get-user";
import { getXpOverview } from "@/lib/db/queries/xp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getUserIdOrRedirect();
  const overview = await getXpOverview(userId);
  return NextResponse.json(overview);
}
