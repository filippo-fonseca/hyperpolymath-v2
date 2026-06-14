// apps/desktop/src/api/client.ts
// HTTP client for the JARVIS server APIs.
//
// Uses @tauri-apps/plugin-http instead of global fetch so requests are
// routed through Tauri's native HTTP layer, bypassing WKWebView's CORS
// restrictions. Without this, cross-origin requests to http://localhost:3000
// from the WKWebView origin would be blocked.

import { fetch } from "@tauri-apps/plugin-http";

import { getEnv } from "@/env";
import { getDeviceToken } from "@/auth/device-token";

/**
 * Build auth headers for outgoing requests.
 *
 * If a device token has been pasted in (from /settings/desktop), prefer it —
 * the server's validateDesktopBearer maps it to a user_id. Always also send
 * the legacy x-trigger-secret header so the ESP32 path keeps working until
 * we fully retire it. The server short-circuits on the bearer when valid.
 */
async function authHeaders(triggerSecret: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "x-trigger-secret": triggerSecret,
  };
  const token = await getDeviceToken();
  if (token) headers["authorization"] = `Bearer ${token}`;
  return headers;
}

/**
 * POST /api/jarvis/voice/source/claim
 * Registers a fresh voice-source claim on the Next.js server (TTL 30s).
 * Called on every wake event for belt-and-braces freshness alongside the
 * persistent 10s background heartbeat in main.ts (Plan 14-04).
 */
export async function postClaim(): Promise<void> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  const res = await fetch(`${apiBaseUrl}/api/jarvis/voice/source/claim`, {
    method: "POST",
    headers: {
      ...(await authHeaders(triggerSecret)),
      "content-type": "application/json",
    },
    body: "{}",
  });
  if (!res.ok) {
    // Non-fatal — log and continue. A failed claim means the browser may
    // start its own mic for this turn but the capture will still succeed.
    // eslint-disable-next-line no-console
    console.warn(`[claim] ${res.status}`);
  }
}

/**
 * POST /api/jarvis/tts
 * Fetches raw PCM audio (16-bit signed LE @ 24kHz mono) from ElevenLabs
 * via the server proxy. The desktop auth path sends X-Trigger-Secret
 * instead of the Supabase cookie used by the browser.
 *
 * Returns the raw PCM blob, or null on failure.
 */
export async function postTts(args: {
  text: string;
  voiceId?: string;
}): Promise<Blob | null> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  const res = await fetch(`${apiBaseUrl}/api/jarvis/tts`, {
    method: "POST",
    headers: {
      ...(await authHeaders(triggerSecret)),
      "content-type": "application/json",
    },
    body: JSON.stringify({ text: args.text, voiceId: args.voiceId }),
  });
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[tts] ${res.status}`);
    return null;
  }
  // tauri plugin-http returns ArrayBuffer via res.arrayBuffer()
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: "application/octet-stream" });
}

/**
 * POST /api/jarvis/voice/transcript
 * Sends the captured WAV to the server for Groq STT transcription.
 * The server fans the transcript out to browser tabs via physicalBus SSE.
 *
 * Headers:
 *   x-trigger-secret: <PHYSICAL_TRIGGER_SECRET>
 *   content-type: audio/wav
 *   x-jarvis-vad-end-at: <epoch_ms> — timestamp when VAD declared silence end
 *
 * Response: { transcript: string, sttDoneAt: number }
 */
export async function postTranscript(args: {
  wav: Blob;
  vadEndAt: number;
}): Promise<{ transcript: string; sttDoneAt: number } | null> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  const buf = new Uint8Array(await args.wav.arrayBuffer());
  const res = await fetch(`${apiBaseUrl}/api/jarvis/voice/transcript`, {
    method: "POST",
    headers: {
      ...(await authHeaders(triggerSecret)),
      "content-type": "audio/wav",
      "x-jarvis-vad-end-at": String(args.vadEndAt),
    },
    body: buf,
  });
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[transcript] ${res.status}`);
    return null;
  }
  return (await res.json()) as { transcript: string; sttDoneAt: number };
}

/**
 * POST /api/jarvis/voice/transcript  (probe mode — `x-jarvis-probe: 1`)
 *
 * Side-effect-free STT: the server transcribes the audio and returns the text
 * WITHOUT fanning it out to browser tabs, persisting a turn, or running the
 * agent. Used to poll a rolling audio tail for the "Done, JARVIS" stop phrase
 * while the mic is open. Returns the transcript, or null on any failure
 * (probe errors are non-fatal — the hotkey is always the reliable stop).
 */
export async function probeTranscript(wav: Blob): Promise<string | null> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  const buf = new Uint8Array(await wav.arrayBuffer());
  const res = await fetch(`${apiBaseUrl}/api/jarvis/voice/transcript`, {
    method: "POST",
    headers: {
      ...(await authHeaders(triggerSecret)),
      "content-type": "audio/wav",
      "x-jarvis-probe": "1",
    },
    body: buf,
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { transcript?: string };
  return json.transcript ?? null;
}
