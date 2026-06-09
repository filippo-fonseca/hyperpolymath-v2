import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getUserOrRedirect } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { integrationTokens } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/integrations/strava/callback — finish Strava OAuth.
 *
 * Validates the state cookie, exchanges the code for tokens, upserts the
 * row into integration_tokens (provider='strava'), and redirects back to
 * /insights with a status flag.
 *
 * Strava rotates refresh_token on every exchange — the data layer
 * (lib/integrations/strava/activities.ts) handles subsequent rotations.
 * This route only writes the FIRST one.
 */

const STATE_COOKIE_NAME = "strava_oauth_state";

interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  athlete?: { id: number };
}

export async function GET(req: Request): Promise<Response> {
  const user = await getUserOrRedirect();

  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const stateFromQuery = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  // Read AND delete the state cookie (single-use).
  const cookieStore = await cookies();
  const stateFromCookie = cookieStore.get(STATE_COOKIE_NAME)?.value;
  cookieStore.delete(STATE_COOKIE_NAME);

  if (oauthError) {
    return NextResponse.redirect(new URL("/insights?strava=denied", req.url));
  }
  if (!code || !stateFromCookie || stateFromQuery !== stateFromCookie) {
    return NextResponse.redirect(new URL("/insights?strava=state_mismatch", req.url));
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/insights?strava=server_misconfigured", req.url));
  }

  let tokenJson: StravaTokenResponse;
  try {
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[strava-callback] token exchange failed", res.status, body);
      return NextResponse.redirect(new URL("/insights?strava=exchange_failed", req.url));
    }
    tokenJson = (await res.json()) as StravaTokenResponse;
  } catch (e) {
    console.error("[strava-callback] token exchange threw", e);
    return NextResponse.redirect(new URL("/insights?strava=exchange_failed", req.url));
  }

  await db
    .insert(integrationTokens)
    .values({
      userId: user.id,
      provider: "strava",
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresAt: new Date(tokenJson.expires_at * 1000),
    })
    .onConflictDoUpdate({
      target: [integrationTokens.userId, integrationTokens.provider],
      set: {
        accessToken: tokenJson.access_token,
        refreshToken: tokenJson.refresh_token,
        expiresAt: new Date(tokenJson.expires_at * 1000),
        updatedAt: sql`now()`,
      },
    });

  return NextResponse.redirect(new URL("/insights?strava=connected", req.url));
}
