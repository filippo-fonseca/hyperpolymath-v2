// apps/desktop/src/api/client.ts
// HTTP client for the JARVIS server APIs.
//
// Uses @tauri-apps/plugin-http instead of global fetch so requests are
// routed through Tauri's native HTTP layer, bypassing WKWebView's CORS
// restrictions. Without this, cross-origin requests to http://localhost:3000
// from the WKWebView origin would be blocked.

import { fetch } from "@tauri-apps/plugin-http";
import type {
  Routine,
  RoutineTriggerType,
} from "@hyperpolymath/jarvis-core/routines";

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

// Phase 2 (Task 2.1): the desktop always operates in computer-control mode.
// Sent ONLY on the two turn entry points (postText / postTranscript) so the
// backend appends the COMPUTER-CONTROL MODE steering block. Browser/mobile
// turns never send this header and are unaffected. Not sent on claim/TTS.
const JARVIS_MODE_HEADER: Record<string, string> = { "x-jarvis-mode": "computer" };

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
 * POST /api/jarvis/screenshot/describe
 * Ships a captured screen PNG (base64) to the server, which runs a one-shot
 * vision call and PUBLISHES the spoken description itself over the physical
 * SSE bus (jarvis-response-start/chunk/end) — the desktop's normal TTS path
 * picks it up, so callers fire-and-forget. Auth matches postTts
 * (Bearer device token + legacy x-trigger-secret).
 *
 * Returns true when the server accepted the image, false otherwise.
 */
export async function postScreenshotDescribe(pngBase64: string): Promise<boolean> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  const res = await fetch(`${apiBaseUrl}/api/jarvis/screenshot/describe`, {
    method: "POST",
    headers: {
      ...(await authHeaders(triggerSecret)),
      "content-type": "application/json",
    },
    body: JSON.stringify({ png_base64: pngBase64 }),
  });
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[screenshot/describe] ${res.status}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Computer Use step loop — wire contract with
// apps/web/app/api/jarvis/computer-use/step/route.ts (fixed shapes; the
// desktop echoes `history` back verbatim and answers each returned action id
// in the next step's `tool_results`).
// ---------------------------------------------------------------------------

/** Execution result for one previously returned action. */
export interface ComputerUseToolResult {
  tool_use_id: string;
  ok: boolean;
  error?: string;
}

/** One next action to execute: raw computer_20251124 tool input + its id. */
export interface ComputerUseStepAction {
  id: string;
  input: Record<string, unknown>;
}

export interface ComputerUseStepResponse {
  ok: boolean;
  session_id: string;
  done: boolean;
  actions: ComputerUseStepAction[];
  /** Spoken narration — the SERVER already published it over the SSE bus. */
  say?: string;
  /** Opaque image-stripped conversation; echo back verbatim next step. */
  history: unknown[];
}

/**
 * POST /api/jarvis/computer-use/step
 * One step of the Computer Use loop: ships the current (downscaled)
 * screenshot + previous execution results, gets back the model's next
 * actions. Auth matches postScreenshotDescribe (Bearer device token +
 * legacy x-trigger-secret). Returns null on any transport/server failure —
 * the caller stops the loop and stays silent (the server owns speech).
 */
export async function postComputerUseStep(args: {
  sessionId: string;
  task: string;
  stepIndex: number;
  screenshotBase64: string;
  displayWidth: number;
  displayHeight: number;
  history: unknown[];
  toolResults: ComputerUseToolResult[];
}): Promise<ComputerUseStepResponse | null> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  const res = await fetch(`${apiBaseUrl}/api/jarvis/computer-use/step`, {
    method: "POST",
    headers: {
      ...(await authHeaders(triggerSecret)),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      session_id: args.sessionId,
      task: args.task,
      step_index: args.stepIndex,
      screenshot_base64: args.screenshotBase64,
      display_width: args.displayWidth,
      display_height: args.displayHeight,
      history: args.history,
      tool_results: args.toolResults,
    }),
  });
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[computer-use] step POST ${res.status}`);
    return null;
  }
  const json = (await res.json()) as ComputerUseStepResponse;
  if (json.ok !== true) {
    // eslint-disable-next-line no-console
    console.warn("[computer-use] step response not ok", json);
    return null;
  }
  return json;
}

/**
 * POST /api/jarvis/voice/text
 * Triggers a JARVIS turn from typed/synthetic text (mirrors the mobile app).
 * The server runs the agent and streams the response back over the physicalBus
 * SSE (jarvis-response-* events), which the desktop already renders + speaks.
 *
 * Used by the proactive briefing: on wake, we synthesize a "give me my
 * briefing" turn without any microphone audio. Non-fatal on failure.
 */
export async function postText(text: string): Promise<boolean> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  const res = await fetch(`${apiBaseUrl}/api/jarvis/voice/text`, {
    method: "POST",
    headers: {
      ...(await authHeaders(triggerSecret)),
      ...JARVIS_MODE_HEADER,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.warn(`[voice/text] ${res.status}`);
    return false;
  }
  return true;
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
      ...JARVIS_MODE_HEADER,
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

// ---------------------------------------------------------------------------
// JARVIS Routines (natural-language "triggers → agentic blocks").
// The desktop reads the owner's enabled routines to build its trigger
// registry (wake/utterance phrases, per-routine hotkeys, time scheduler) and
// fires them by POSTing the routine's blocks INLINE — see postRunRoutine.
// ---------------------------------------------------------------------------

/**
 * GET /api/jarvis/routines
 * Fetches the owner's ENABLED routines (bearer + owner gated). Fail-safe:
 * returns [] on any non-ok/parse failure so a transient server hiccup leaves
 * the desktop with no triggers rather than crashing the boot path.
 */
export async function getRoutines(): Promise<Routine[]> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  try {
    const res = await fetch(`${apiBaseUrl}/api/jarvis/routines`, {
      method: "GET",
      headers: await authHeaders(triggerSecret),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[routines] GET ${res.status}`);
      return [];
    }
    const json = (await res.json()) as { routines?: unknown };
    return Array.isArray(json.routines) ? (json.routines as Routine[]) : [];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[routines] GET failed", err);
    return [];
  }
}

/**
 * POST /api/jarvis/routines/run
 * Fires a routine. Sends the routine's blocks INLINE ({ routine: { name,
 * blocks } }) — NOT { routineId } — because the server's routineId load path
 * calls listRoutines() (cookie/getClaims-authed) which fails under the desktop
 * bearer, whereas the inline path is bearer + owner gated like /voice/text.
 * The desktop already holds the full routine object from getRoutines(), so it
 * passes its blocks directly.
 *
 * Fire-and-forget: the server streams each block's result over the physical
 * SSE bus (jarvis-response-start/chunk/end per block), which the desktop
 * already renders + speaks. Returns true on the ack, false otherwise.
 */
export async function postRunRoutine(routine: Routine): Promise<boolean> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  try {
    const res = await fetch(`${apiBaseUrl}/api/jarvis/routines/run`, {
      method: "POST",
      headers: {
        ...(await authHeaders(triggerSecret)),
        ...JARVIS_MODE_HEADER,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        routine: { name: routine.name, blocks: routine.spec.blocks },
        isVoice: true,
      }),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[routines] run POST ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[routines] run POST failed", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// iMessage recipient resolution (tie-breaker / fallback for the send gate).
// macOS Contacts is the desktop's authoritative source; this cross-references a
// NAME against handles the owner has actually messaged (ingested chat.db →
// imessage_messages) so a send never lands on a guessed/random handle.
// ---------------------------------------------------------------------------

/**
 * GET /api/imessage/resolve?name=<person>
 * Returns the distinct raw iMessage handles (phone/email) the owner has
 * recently messaged whose resolved contact name matches `name`, most-recent
 * first. Bearer + owner gated. Fail-safe: returns [] on any non-ok/parse/
 * transport failure so the caller can fall back to Contacts or an honest
 * "couldn't find them" line rather than crashing the send path.
 */
export async function resolveRecentImessageHandles(name: string): Promise<string[]> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  try {
    const url = `${apiBaseUrl}/api/imessage/resolve?name=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: await authHeaders(triggerSecret),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[imessage/resolve] GET ${res.status}`);
      return [];
    }
    const json = (await res.json()) as { handles?: unknown };
    return Array.isArray(json.handles)
      ? (json.handles.filter((h) => typeof h === "string") as string[])
      : [];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[imessage/resolve] GET failed", err);
    return [];
  }
}

// Re-export the trigger-type alias so registry/dispatch code can import it
// alongside the client without a second jarvis-core import site.
export type { RoutineTriggerType };

