import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getUserOrRedirect } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { integrationTokens } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/integrations/strava/disconnect — remove Strava tokens.
 *
 * Auth-gated. Deletes the integration_tokens row for the current user +
 * provider='strava'. Idempotent — calling on an already-disconnected user
 * is a 200 no-op.
 *
 * The token deauthorization on Strava's side (so they revoke OUR access)
 * is best-effort: we hit Strava's deauthorize endpoint with the access
 * token if we have one, but proceed with the local delete either way.
 */
export async function POST(): Promise<Response> {
  const user = await getUserOrRedirect();

  // Best-effort deauthorize on Strava's side. If it fails (network, 401,
  // anything) we still proceed with the local delete — leaving a dead row
  // here is worse than leaving a stale entry in Strava's user-side
  // "Apps & Devices" page.
  const existing = await db
    .select({ accessToken: integrationTokens.accessToken })
    .from(integrationTokens)
    .where(
      and(
        eq(integrationTokens.userId, user.id),
        eq(integrationTokens.provider, "strava"),
      ),
    )
    .limit(1);

  if (existing[0]?.accessToken) {
    try {
      await fetch("https://www.strava.com/oauth/deauthorize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${existing[0].accessToken}`,
        },
      });
    } catch {
      // ignore — proceed with local delete regardless
    }
  }

  await db
    .delete(integrationTokens)
    .where(
      and(
        eq(integrationTokens.userId, user.id),
        eq(integrationTokens.provider, "strava"),
      ),
    );

  return NextResponse.json({ ok: true });
}
