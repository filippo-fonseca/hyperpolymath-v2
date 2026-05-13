/**
 * `GET /api/gcal/status` — current user's Google Calendar connection status.
 *
 * Phase 4 Plan 04-03 (D-04 / M-04 fix).
 *
 * Why a Route Handler instead of a Server Action:
 *   - `useGcalConnectionStatus` is consumed by PersistentNav (renders on
 *     EVERY page in the (app) layout). Server Actions tunnel through Next's
 *     React Server-Action protocol which is more expensive per call than a
 *     plain GET. The hook also runs every 60s + on window focus — a thin
 *     JSON route is the right shape.
 *   - Returning JSON gives the client hook a stable contract independent
 *     of whether the underlying source is Postgres or gcal — Plan 04-04
 *     can swap the implementation without touching every consumer.
 *
 * Auth: `getUserOrRedirect()` because this endpoint can be hit from
 * settings (pre-onboarded surface) as well as onboarded pages. The hook
 * fails gracefully — if the route returns 302/401, the client returns
 * "not_connected" and falls back to the badge-off behavior.
 *
 * Response shape: `{ status: "connected" | "not_connected" | "expired" }`.
 */

import { NextResponse } from "next/server";
import { getUserOrRedirect } from "@/lib/auth/get-user";
import { getGcalConnectionStatus } from "@/lib/db/queries/gcal-connection";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUserOrRedirect();
  const status = await getGcalConnectionStatus(user.id);
  return NextResponse.json({ status });
}
