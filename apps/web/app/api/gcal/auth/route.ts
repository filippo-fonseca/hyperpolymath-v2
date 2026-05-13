/**
 * GET /api/gcal/auth — start the Google Calendar OAuth flow (CAL-01).
 *
 * Phase 4 Plan 04-02 (Pattern 1, Pitfall 1 + Pitfall 2).
 *
 * Responsibilities:
 *   1. Prove session via `getUserOrRedirect()` (per the Plan 04-01
 *      `<auth_helper_convention>` block — `/api/gcal/*` uses the auth-only
 *      helper, NOT `requireOnboarded()` — the OAuth flow is reachable
 *      mid-onboarding).
 *   2. Generate a 32-byte hex state nonce.
 *   3. Stash the nonce in an httpOnly cookie (10-minute TTL, single-use) so
 *      the callback can CSRF-validate (Pitfall 2).
 *   4. Build Google's consent URL with the offline access type AND a
 *      forced consent prompt — BOTH non-negotiable (see param block
 *      below). Without forcing the consent screen, Google silently
 *      omits the refresh_token on a second consent for a previously-
 *      authorized scope (Pitfall 1). The disconnect → reconnect flow
 *      MUST receive a fresh refresh_token every time.
 *   5. 302 redirect to Google.
 *
 * Why this is a Route Handler, not a Server Action:
 *   - The Connect button is an `<a href="/api/gcal/auth">` (full-page nav,
 *     NOT client-side). Server Actions don't have a stable GET URL.
 *
 * No try/catch around the redirect: if the env vars are missing,
 * `createOAuth2Client()` will throw at the OAuth2 constructor level and
 * Next.js will surface a 500 — that's the correct behavior (misconfigured
 * env is not a recoverable runtime error).
 */

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserOrRedirect } from "@/lib/auth/get-user";
import { createOAuth2Client } from "@/lib/gcal/client";

const STATE_COOKIE_NAME = "gcal_oauth_state";
const STATE_COOKIE_MAX_AGE_SECONDS = 600; // 10 minutes
const GCAL_SCOPE = "https://www.googleapis.com/auth/calendar"; // D-06

export async function GET(): Promise<Response> {
  // Step 1: ensure the user is signed in. Uses `getClaims()` internally
  // per CLAUDE.md Critical Pattern 1 — the cookie-only session reader
  // is forbidden in server code (spoofable).
  await getUserOrRedirect();

  // Step 2: generate a cryptographically-random state nonce.
  const state = randomBytes(32).toString("hex");

  // Step 3: stash in httpOnly cookie. `sameSite: "lax"` lets the cookie ride
  // along on the top-level GET that Google redirects to /api/gcal/callback
  // (browsers send lax cookies on top-level navigations, which is exactly
  // what an OAuth callback is). `secure` only in production — local dev
  // runs over http and would drop secure cookies otherwise.
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: STATE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });

  // Step 4: build Google's consent URL.
  //   - access_type=offline  → tells Google to issue a refresh_token along
  //                            with the access_token.
  //   - prompt=consent       → forces Google to re-show the consent dialog
  //                            (Pitfall 1: without this, second consent
  //                            omits refresh_token).
  //   - include_granted_scopes=true → incremental auth ergonomics if we
  //                            ever add more scopes; harmless today.
  const oauth2Client = createOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [GCAL_SCOPE],
    state,
    include_granted_scopes: true,
  });

  // Step 5: 302 redirect.
  return NextResponse.redirect(url);
}
