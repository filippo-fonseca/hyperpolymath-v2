/**
 * `getGcalConnectionStatus(userId)` — derive the user-visible Google Calendar
 * connection state from the `users` row (SET-02).
 *
 * Phase 4 Plan 04-02.
 *
 * The status is computed from the `gcal_refresh_token_encrypted` column:
 *   - column NULL                 → "not_connected"
 *   - column non-null (any value) → "connected"
 *
 * Why so simple:
 *   - The "expired" branch in the type is reserved for a future surface
 *     where a background tick proactively detects refresh-token expiry
 *     WITHOUT having to round-trip Google. Today, `getValidGcalToken`
 *     (Plan 04-01) handles expiry/revoke lazily on the next API call: if
 *     the refresh fails with `invalid_grant`, it clears the encrypted
 *     columns AND throws `GcalTokenRevokedError`. Next call to this
 *     function would observe a NULL refresh token → "not_connected".
 *   - A genuine "expired but refreshable" state is rare in practice and
 *     transient (Google's refresh tokens for installed/web apps don't
 *     expire under normal use). Surfacing it here would risk a flicker.
 *
 * Callers:
 *   - apps/web/app/(app)/settings/page.tsx (Server Component) → drives the
 *     `<GcalConnectionRow status={...} />` badge + button.
 *   - Future: top-of-page disconnect banner at /calendar (Plan 04-03/04).
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export type GcalConnectionStatus = "connected" | "not_connected" | "expired";

export async function getGcalConnectionStatus(
  userId: string,
): Promise<GcalConnectionStatus> {
  const rows = await db
    .select({
      refreshEnc: users.gcalRefreshTokenEncrypted,
      expiresAt: users.gcalTokenExpiresAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  // Empty result → user row missing (should never happen because the
  // auth-users trigger from Plan 02 backfills `public.users` on signup;
  // defensive bail).
  if (rows.length === 0 || !rows[0]?.refreshEnc) return "not_connected";

  // Refresh token present → connected. See module doc for why we don't
  // surface "expired" eagerly.
  return "connected";
}
