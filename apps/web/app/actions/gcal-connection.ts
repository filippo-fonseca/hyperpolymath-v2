"use server";

/**
 * Server Action: `disconnectGcal()` — sever the user's Google Calendar
 * connection (CAL-09).
 *
 * Phase 4 Plan 04-02 (Pitfall 6 ordering).
 *
 * Ordering — CRITICAL (Pitfall 6):
 *   1. SELECT the encrypted refresh_token (so we have something to revoke).
 *   2. CLEAR the DB columns first — this is the source of truth.
 *   3. Best-effort `oauth2Client.revokeToken(refreshToken)`. Wrapped in
 *      try/catch — failure does NOT propagate to the user. Logged.
 *
 * Why this ordering:
 *   - If we revoked FIRST and the DB clear failed, the user would be
 *     locked out (Google says "revoked", DB says "connected", every API
 *     call would throw GcalTokenRevokedError on the next refresh).
 *   - With our ordering, the worst case is "DB cleared but Google still
 *     thinks the token is valid for a while". The token would lapse on
 *     its own; the user can reconnect via /api/gcal/auth and Google
 *     re-issues a fresh refresh_token (prompt=consent flow).
 *
 * D-09 / D-10:
 *   We deliberately leave `gcal_default_calendar_id` and
 *   `gcal_visible_calendar_ids` IN PLACE. The common case is "user
 *   reconnects with the same Google account" — preserving their picks
 *   avoids re-prompting them. Plan 04-04 will compare account identity
 *   on reconnect; if the target Google account changes, those columns
 *   get reset there.
 *
 * Auth: per the Plan 04-01 `<auth_helper_convention>` block, disconnect
 * uses `getUserOrRedirect()` (auth-only, NOT onboarded-gated — disconnect
 * is a Settings affordance reachable mid-onboarding).
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getUserOrRedirect } from "@/lib/auth/get-user";
import { createOAuth2Client } from "@/lib/gcal/client";
import { decryptToken } from "@/lib/gcal/encryption";

type ActionResult = { success: true } | { success: false; error: string };

export async function disconnectGcal(): Promise<ActionResult> {
  const user = await getUserOrRedirect();

  // Step 1: read the encrypted refresh_token so we can revoke it after the
  // DB clear. If the column is NULL the user is already disconnected —
  // we still run the DB update (no-op) and return success so the UI
  // converges to the disconnected state.
  const rows = await db
    .select({ refreshEnc: users.gcalRefreshTokenEncrypted })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const encryptedRefresh = rows[0]?.refreshEnc ?? null;
  const refreshToken = encryptedRefresh
    ? decryptToken(encryptedRefresh as Buffer)
    : null;

  // Step 2: CLEAR DB FIRST (Pitfall 6). The local state is the source of
  // truth — if revoke fails, we still want the user to see "not connected".
  await db
    .update(users)
    .set({
      gcalRefreshTokenEncrypted: null,
      gcalAccessTokenEncrypted: null,
      gcalTokenExpiresAt: null,
      // Intentionally NOT clearing gcalDefaultCalendarId or
      // gcalVisibleCalendarIds (see module doc — preserve user prefs
      // across same-account reconnects).
    })
    .where(eq(users.id, user.id));

  // Step 3: best-effort revoke. Do NOT throw on failure — the DB is
  // already cleared; the user IS disconnected locally. We log the failure
  // for telemetry and continue. The orphaned Google-side grant will
  // either lapse naturally or be cleaned up at next reconnect (where
  // Google issues a fresh refresh_token via prompt=consent).
  if (refreshToken) {
    try {
      const oauth2Client = createOAuth2Client();
      await oauth2Client.revokeToken(refreshToken);
    } catch (e) {
      console.warn(
        "[gcal] revokeToken failed (best-effort, DB already cleared):",
        e,
      );
    }
  }

  return { success: true };
}
