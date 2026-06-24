/**
 * `getValidDriveClient(userId)` — the Google Drive analogue of
 * `getValidGcalToken`. Returns a `drive_v3.Drive` instance pre-authenticated
 * with a guaranteed-fresh access token, or throws the same typed errors the
 * Calendar path throws (GcalNotConnectedError / GcalTokenRevokedError /
 * GcalTokenRefreshError).
 *
 * Phase 28 (daily Wiki backup to Drive). This reuses the shared
 * `getAuthenticatedGoogleOAuthClient` helper from `lib/gcal/token.ts` so the
 * load-token / refresh / persist / clear-on-invalid_grant semantics stay in one
 * place. The only difference from the Calendar path is the final service wrap:
 * `google.drive(...)` instead of `google.calendar(...)`.
 *
 * Note on scopes: the Drive client only works once the user has consented to
 * the `drive.file` scope (added in `/api/gcal/auth` for Phase 28). Existing
 * refresh tokens predate that scope, so the user must reconnect Google once for
 * Drive uploads to succeed. A missing scope surfaces as a Google API error at
 * call time, which the cron loop catches per-user.
 */

import type { drive_v3 } from "googleapis";
import { google } from "googleapis";
import { getAuthenticatedGoogleOAuthClient } from "@/lib/gcal/token";

export async function getValidDriveClient(
  userId: string,
): Promise<drive_v3.Drive> {
  const auth = await getAuthenticatedGoogleOAuthClient(userId);
  return google.drive({ version: "v3", auth });
}
