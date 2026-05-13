/**
 * GET /api/gcal/callback — finish the Google Calendar OAuth flow (CAL-01).
 *
 * Phase 4 Plan 04-02 (Pattern 1, Pitfalls 1+2; m-01 fix for D-09).
 *
 * Code paths:
 *   1. error=access_denied  → user clicked Cancel on Google's consent
 *                             screen. Redirect to /settings?gcal=denied.
 *   2. state mismatch /     → Pitfall 2 (CSRF). Redirect to
 *      missing code         /settings?gcal=invalid_state.
 *   3. !tokens.refresh_token → Defensive. Should not happen because
 *                              /api/gcal/auth forces prompt=consent
 *                              (Pitfall 1). Redirect to
 *                              /settings?gcal=no_refresh_token so the
 *                              user can disconnect + retry.
 *   4. happy path           → encrypt tokens, persist, auto-default the
 *                             primary calendar (m-01) if first connect,
 *                             302 to /calendar?gcal=connected. Plan 04-03
 *                             surfaces the success toast there.
 *
 * The cookie is deleted on EVERY path (single-use, even when validation
 * fails — prevents a second-attempt CSRF window).
 *
 * m-01 fix (D-09 first-connect auto-default):
 *   On the happy path, if the user has no `gcal_default_calendar_id` yet
 *   we list their calendars and pin the `primary` one. Wrapped in a
 *   try/catch — failure is logged but non-fatal (the user can still pick
 *   a default in Settings). This satisfies D-09 at connect time so Plan
 *   04-03's grid never has to handle a "no default calendar selected"
 *   empty state on first paint after consent.
 *
 * Pitfall 11 (callback URL with ?code= in browser history):
 *   The 302 redirect to /calendar?gcal=connected immediately replaces
 *   the URL bar. The browser history still has the callback URL with
 *   code, but the code is single-use (Google invalidates it on first
 *   exchange). Acceptable defense-in-depth for MVP per research.
 */

import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserOrRedirect } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createOAuth2Client } from "@/lib/gcal/client";
import { encryptToken } from "@/lib/gcal/encryption";

const STATE_COOKIE_NAME = "gcal_oauth_state";

export async function GET(req: Request): Promise<Response> {
  // Auth (per Plan 04-01 <auth_helper_convention> — auth-only, not
  // onboarding-gated; the OAuth flow is reachable mid-onboarding).
  const user = await getUserOrRedirect();

  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const stateFromQuery = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error"); // "access_denied" if user cancelled

  // Read AND delete the state cookie regardless of outcome (single-use).
  const cookieStore = await cookies();
  const stateFromCookie = cookieStore.get(STATE_COOKIE_NAME)?.value;
  cookieStore.delete(STATE_COOKIE_NAME);

  // Path 1: user clicked Cancel on Google's consent screen.
  if (oauthError) {
    return NextResponse.redirect(new URL("/settings?gcal=denied", req.url));
  }

  // Path 2: state CSRF validation (Pitfall 2).
  // Require BOTH sides non-empty AND matching (strict equality).
  if (
    !code ||
    !stateFromQuery ||
    !stateFromCookie ||
    stateFromQuery !== stateFromCookie
  ) {
    return NextResponse.redirect(
      new URL("/settings?gcal=invalid_state", req.url),
    );
  }

  // Exchange the auth code for tokens. The OAuth2 client throws on a 4xx
  // from Google — we let that bubble as a 500 (it indicates either an
  // expired/used code or a misconfigured client; both are exceptional).
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  // Path 3: Google didn't issue a refresh_token. Should be unreachable
  // because /api/gcal/auth passed prompt=consent (Pitfall 1), but we
  // defend against it explicitly so the user gets a clear redirect path
  // instead of a silent half-connected state.
  if (!tokens.refresh_token) {
    return NextResponse.redirect(
      new URL("/settings?gcal=no_refresh_token", req.url),
    );
  }

  // Path 4: happy path — encrypt + persist.
  //
  // encryptToken is sync (per Plan 04-01: node:crypto AES-256-GCM is a
  // sync primitive; the async signature in research was aspirational).
  await db
    .update(users)
    .set({
      gcalRefreshTokenEncrypted: encryptToken(tokens.refresh_token),
      gcalAccessTokenEncrypted: tokens.access_token
        ? encryptToken(tokens.access_token)
        : null,
      gcalTokenExpiresAt: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
    })
    .where(eq(users.id, user.id));

  // m-01 fix — auto-default primary calendar on first connect (D-09).
  // After persisting tokens, check whether the user already has a default
  // calendar pinned. If not, list their calendars, find the entry where
  // `primary === true`, and pin it. Wrapped in try/catch — non-fatal.
  try {
    const existing = await db
      .select({ defaultId: users.gcalDefaultCalendarId })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!existing[0]?.defaultId) {
      oauth2Client.setCredentials(tokens);
      const cal = google.calendar({ version: "v3", auth: oauth2Client });
      const { data } = await cal.calendarList.list();
      const primary = (data.items ?? []).find((c) => c.primary && c.id);
      if (primary?.id) {
        await db
          .update(users)
          .set({ gcalDefaultCalendarId: primary.id })
          .where(eq(users.id, user.id));
      }
    }
  } catch (e) {
    // Non-fatal — the user can still pick a default in Settings (Plan
    // 04-04). Log so we can spot it in dev/prod telemetry.
    console.warn("[gcal] auto-default-primary failed (non-fatal):", e);
  }

  // 302 to /calendar — Plan 04-03's CalendarClient reads `?gcal=connected`
  // and surfaces the success toast there. Lives there (not here) per
  // m-03 fix: the success surface is the calendar grid, not Settings.
  return NextResponse.redirect(new URL("/calendar?gcal=connected", req.url));
}
