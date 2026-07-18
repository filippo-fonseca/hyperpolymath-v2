// apps/desktop/src/physical-extender/cancel-turn.ts
// Real server-side interrupt for voice turns.
//
// Stopping/barging-in used to only silence local audio (ttsPlayer.stop()) while
// the server kept running the model turn and streaming chunks over the physical
// bus. This POSTs /api/jarvis/voice/cancel so the server aborts the in-flight
// runJarvisTurnStream too (Anthropic stream + remaining tool rounds).
//
// The desktop does not track the live turnId at the barge-in site, so we send
// `{ all: true }` — safe because the physical bus is owner-gated single-user.
// Fire-and-forget: a failed cancel POST must never block the local stop.

import { fetch } from "@tauri-apps/plugin-http";
import { getEnv } from "@/env";
import { getDeviceToken } from "@/auth/device-token";

/**
 * Ask the server to abort any in-flight voice turn(s). Fire-and-forget; the
 * caller has already stopped local playback and does not await this.
 */
export async function cancelServerTurns(): Promise<void> {
  try {
    const { apiBaseUrl, triggerSecret } = getEnv();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-trigger-secret": triggerSecret,
    };
    const token = await getDeviceToken();
    if (token) headers["authorization"] = `Bearer ${token}`;

    await fetch(`${apiBaseUrl}/api/jarvis/voice/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({ all: true }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[cancel-turn] server cancel failed (local stop still applied)", err);
  }
}
