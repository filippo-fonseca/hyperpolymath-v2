import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserOrRedirect } from "@/lib/auth/get-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/integrations/strava/connect — start Strava OAuth.
 *
 * Replaces the CLI mint script (tools/strava-mint.mjs) for the common case.
 * Generates a CSRF state token, stores it in an httpOnly cookie, and 302's
 * to Strava's authorize URL. Callback at /api/integrations/strava/callback
 * exchanges the code and persists the tokens.
 *
 * Callback URL must be registered in your Strava app settings:
 *   - http://localhost:3000/api/integrations/strava/callback (dev)
 *   - https://<your-prod-domain>/api/integrations/strava/callback (prod)
 */

const STATE_COOKIE_NAME = "strava_oauth_state";
const SCOPE = "activity:read_all";

export async function GET(req: Request): Promise<Response> {
  await getUserOrRedirect(); // require signed-in; redirect handles unauthed.

  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "STRAVA_CLIENT_ID not configured" },
      { status: 500 },
    );
  }

  const requestUrl = new URL(req.url);
  const redirectUri = `${requestUrl.origin}/api/integrations/strava/callback`;
  const state = randomBytes(32).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: requestUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 min — flow should complete in seconds
  });

  const authorizeUrl = new URL("https://www.strava.com/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("approval_prompt", "auto");
  authorizeUrl.searchParams.set("scope", SCOPE);
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl);
}
