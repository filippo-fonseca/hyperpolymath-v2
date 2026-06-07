import { NextResponse } from "next/server";
import { getVoiceSourceStatus } from "@/lib/voice/source-claim";

/**
 * GET /api/jarvis/voice/source/status
 *
 * Public (no auth) read of the in-memory voice-source claim state.
 * Only caller is the user's own browser (useVoiceSourceStatus hook).
 *
 * Returns:
 *   { desktopClaimed: boolean, expiresAt: number | null }
 *
 * expiresAt is the epoch-ms wall-clock time at which the claim lapses,
 * or null when unclaimed. This lets the hook schedule its own expiry
 * timer in the future if needed, but for now polling at 2-3 s is enough.
 */
export function GET(): NextResponse {
  const { claimed, expiresIn } = getVoiceSourceStatus();
  return NextResponse.json({
    desktopClaimed: claimed,
    expiresAt: claimed ? Date.now() + expiresIn : null,
  });
}
