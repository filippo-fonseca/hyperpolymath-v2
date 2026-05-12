/**
 * OAuth2 client factory for Google Calendar.
 * Phase 4 Plan 04-01.
 *
 * Single source of truth for "what creds does the gcal client use" — every
 * downstream call (api/gcal/auth, api/gcal/callback, lib/gcal/token.ts)
 * imports this so a credential rotation only edits one place.
 *
 * Why the full `googleapis` package (not @googleapis/calendar):
 *   - RESEARCH Open Question 4 / Pitfall 12 leaves this discretionary for MVP.
 *     Plan 04-03 Task 3's smoke will measure /api/gcal/auth cold-start latency
 *     with a documented 2s threshold; if exceeded we swap to the focused
 *     packages (@googleapis/calendar + google-auth-library). Until then the
 *     meta-package keeps OAuth2Client + calendar_v3 in one import surface.
 *
 * The env vars assumed-present at runtime (validated upstream in middleware
 * + the /api/gcal/auth route handler, not here, to keep this factory cheap):
 *   - GOOGLE_CLIENT_ID
 *   - GOOGLE_CLIENT_SECRET
 *   - NEXT_PUBLIC_GCAL_REDIRECT_URI
 */

import { google } from "googleapis";

// Use the constructor's InstanceType directly — `google-auth-library` is a
// transitive dep we don't list in package.json (importing its types would
// require adding it as a direct dep just for a type alias).
export type GcalOAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export function createOAuth2Client(): GcalOAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_GCAL_REDIRECT_URI,
  );
}
