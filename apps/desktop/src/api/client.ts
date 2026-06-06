// apps/desktop/src/api/client.ts
// HTTP client for the JARVIS server APIs.
//
// Uses @tauri-apps/plugin-http instead of global fetch so requests are
// routed through Tauri's native HTTP layer, bypassing WKWebView's CORS
// restrictions. Without this, cross-origin requests to http://localhost:3000
// from the WKWebView origin would be blocked.

import { fetch } from "@tauri-apps/plugin-http";

import { getEnv } from "@/env";

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
      "x-trigger-secret": triggerSecret,
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
      "content-type": "application/json",
      "x-trigger-secret": triggerSecret,
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
      "x-trigger-secret": triggerSecret,
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
