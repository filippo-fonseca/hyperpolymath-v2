/**
 * `getValidGcalToken(userId)` — single entry point every Google Calendar call
 * funnels through. Returns a `calendar_v3.Calendar` instance pre-authenticated
 * with a guaranteed-fresh access token, or throws a typed error the UI knows
 * how to handle.
 *
 * Phase 4 Plan 04-01 (CAL-02, D-07).
 *
 * Behavior matrix:
 *
 *   DB state                              | Action
 *   --------------------------------------|------------------------------------
 *   No encrypted refresh_token            | throw GcalNotConnectedError
 *   Access token unexpired (> 60s left)   | return Calendar; no Google call
 *   Access token expiring soon (≤ 60s)    | refresh via Google, persist, return
 *   Refresh fails with invalid_grant      | CLEAR encrypted columns, throw
 *                                         | GcalTokenRevokedError (Pitfall 6)
 *   Refresh fails with anything else      | throw GcalTokenRefreshError
 *
 * Critical correctness notes:
 *   - The `'tokens'` event on OAuth2Client fires whenever Google issues a new
 *     refresh OR access token. We subscribe BEFORE calling getAccessToken so
 *     the refresh-on-expiry path's new tokens get persisted. The handler is a
 *     void-floating async — it MUST NOT block the request thread.
 *   - On invalid_grant we CLEAR the DB FIRST, THEN throw. The opposite order
 *     ("throw then clear") risks the bad UX described in RESEARCH Pitfall 6.
 *     The local clear is the source of truth; revoking on Google's side is
 *     optional (it will happen during user-initiated Disconnect).
 *   - We never read the Phase 1 plain `gcal_*` columns. If the user only has
 *     plain-text tokens (legacy), they MUST reconnect via /api/gcal/auth.
 *     This is acceptable because Phase 1's plain columns were intentional
 *     placeholders — no production user has connected gcal yet.
 *
 * Used by:
 *   - app/actions/gcal-events.ts (Plan 04-04)
 *   - app/actions/gcal-calendars.ts (Plan 04-04)
 *   - components/calendar/CalendarClient.tsx (indirectly via Server Action)
 *   - app/(app)/calendar/page.tsx Server Component initial fetch
 */

import type { calendar_v3 } from "googleapis";
import { eq } from "drizzle-orm";
import { google } from "googleapis";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createOAuth2Client } from "./client";
import { decryptToken, encryptToken } from "./encryption";
import {
  GcalNotConnectedError,
  GcalTokenRefreshError,
  GcalTokenRevokedError,
} from "./errors";

// Re-export for ergonomic single-import: callers do
//   import { getValidGcalToken, GcalTokenRevokedError } from "@/lib/gcal/token";
export { GcalNotConnectedError, GcalTokenRefreshError, GcalTokenRevokedError };

const REFRESH_LEEWAY_MS = 60 * 1000; // refresh if access token expires within 60s

/**
 * Determines whether the OAuth refresh attempt failed with `invalid_grant`,
 * which is Google's signal that the refresh_token is no longer valid (the user
 * revoked access, the password changed, etc.). googleapis surfaces this as a
 * GaxiosError with status 400 and `error.response.data.error === "invalid_grant"`.
 *
 * We accept multiple shapes because the SDK's surfaced error has bounced
 * across a few versions; matching liberally is safer than missing the case.
 */
function isInvalidGrantError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const message = typeof e.message === "string" ? e.message : "";
  const response = e.response as Record<string, unknown> | undefined;
  const responseData = response?.data as Record<string, unknown> | undefined;
  const errorField =
    typeof responseData?.error === "string" ? (responseData.error as string) : undefined;
  return (
    errorField === "invalid_grant" ||
    /invalid_grant/i.test(message)
  );
}

export async function getValidGcalToken(userId: string): Promise<calendar_v3.Calendar> {
  // 1. Load the user's encrypted tokens + expiry from the DB.
  const rows = await db
    .select({
      gcalRefreshTokenEncrypted: users.gcalRefreshTokenEncrypted,
      gcalAccessTokenEncrypted: users.gcalAccessTokenEncrypted,
      gcalTokenExpiresAt: users.gcalTokenExpiresAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (!row || !row.gcalRefreshTokenEncrypted) {
    // No stored refresh token = the user has never connected gcal (or has
    // disconnected). Throw BEFORE creating an OAuth client — there's nothing
    // to refresh.
    throw new GcalNotConnectedError();
  }

  const refreshToken = decryptToken(row.gcalRefreshTokenEncrypted as Buffer);
  const accessToken = row.gcalAccessTokenEncrypted
    ? decryptToken(row.gcalAccessTokenEncrypted as Buffer)
    : null;
  const expiresAt = row.gcalTokenExpiresAt
    ? new Date(row.gcalTokenExpiresAt).getTime()
    : null;

  // 2. Build the OAuth2 client and seed it with the stored tokens.
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken ?? undefined,
    expiry_date: expiresAt ?? undefined,
  });

  // 3. Subscribe to the 'tokens' event BEFORE any refresh attempt so the
  //    new tokens get persisted. Use a void-floating async to avoid blocking
  //    the request thread on the DB write.
  oauth2Client.on("tokens", (newTokens) => {
    void persistRefreshedTokens(userId, newTokens, refreshToken);
  });

  // 4. Decide whether we need a refresh. If the access token is missing or
  //    within the leeway window of expiry, force a refresh by calling
  //    getAccessToken() — the SDK handles the actual refresh + 'tokens' emit.
  const now = Date.now();
  const needsRefresh =
    !accessToken || expiresAt === null || expiresAt - now <= REFRESH_LEEWAY_MS;

  if (needsRefresh) {
    try {
      await oauth2Client.getAccessToken();
    } catch (err) {
      if (isInvalidGrantError(err)) {
        // Clear the DB FIRST (Pitfall 6) — the local clear is the source of
        // truth. Revoking on Google's side happens during user Disconnect.
        await db
          .update(users)
          .set({
            gcalRefreshTokenEncrypted: null,
            gcalAccessTokenEncrypted: null,
            gcalTokenExpiresAt: null,
          })
          .where(eq(users.id, userId));
        throw new GcalTokenRevokedError();
      }
      throw new GcalTokenRefreshError(
        err instanceof Error ? err.message : "Failed to refresh Google Calendar access token",
        err,
      );
    }
  }

  // 5. Return the Calendar client.
  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Persist newly-refreshed tokens to the DB. Called from the 'tokens' event
 * listener — DO NOT await this from the request thread.
 *
 * The 'tokens' event payload contains:
 *   - access_token + expiry_date on every refresh
 *   - refresh_token ONLY if Google rotates it (rare; usually only on the
 *     first consent or after a long absence). When omitted, preserve the
 *     existing refresh_token (passed in as fallbackRefreshToken).
 */
async function persistRefreshedTokens(
  userId: string,
  newTokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  },
  fallbackRefreshToken: string,
): Promise<void> {
  const access = newTokens.access_token;
  const refresh = newTokens.refresh_token ?? fallbackRefreshToken;
  const update: {
    gcalAccessTokenEncrypted?: Buffer;
    gcalRefreshTokenEncrypted?: Buffer;
    gcalTokenExpiresAt?: Date;
  } = {};

  if (access) update.gcalAccessTokenEncrypted = encryptToken(access);
  // Always re-write the refresh token so the encrypted-column lifecycle stays
  // consistent (fallbackRefreshToken is what we already had, so this is a
  // no-op write in the common case).
  update.gcalRefreshTokenEncrypted = encryptToken(refresh);
  if (newTokens.expiry_date) update.gcalTokenExpiresAt = new Date(newTokens.expiry_date);

  if (Object.keys(update).length === 0) return;

  await db.update(users).set(update).where(eq(users.id, userId));
}
