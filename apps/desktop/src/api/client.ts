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
 * POST /api/jarvis/voice/warmup
 *
 * Fire-and-forget cache pre-warm. The FIRST real voice turn of a session pays
 * ~45s to create the Anthropic 1h prompt cache; every turn after reads it in
 * ~600ms. Hitting this ahead of the user's first spoken command (at boot and
 * on every wake) moves that one-time creation off the critical path so turn 1
 * reads a warm cache. Side-effect-free on the server (no turn persisted, no
 * SSE, no TTS). Non-fatal: a failed warmup just means the first turn pays the
 * old cost.
 */
export async function postWarmup(): Promise<void> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  try {
    const res = await fetch(`${apiBaseUrl}/api/jarvis/voice/warmup`, {
      method: "POST",
      headers: {
        ...(await authHeaders(triggerSecret)),
        ...JARVIS_MODE_HEADER,
        "content-type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[warmup] ${res.status}`);
      return;
    }
    const json = (await res.json()) as {
      cacheRead?: number;
      cacheCreated?: number;
      ms?: number;
    };
    // eslint-disable-next-line no-console
    console.log(
      `[warmup] cache read/create ${json.cacheRead ?? "?"}/${json.cacheCreated ?? "?"} in ${json.ms ?? "?"}ms`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[warmup] failed", err);
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
 * POST /api/jarvis/voice/history/clear
 * Wipes the server-side conversation memory (jarvis_turns) for this user —
 * the same table the voice agent reads as its 15-minute cross-turn memory.
 * The HUD's Clear control calls this after emptying the visible transcript so
 * a fresh conversation doesn't inherit stale turns (including curl-fired test
 * turns). Best-effort: a failure is logged and surfaced as `false`.
 */
export async function clearHistory(): Promise<boolean> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  try {
    const res = await fetch(`${apiBaseUrl}/api/jarvis/voice/history/clear`, {
      method: "POST",
      headers: {
        ...(await authHeaders(triggerSecret)),
        "content-type": "application/json",
      },
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[voice/history/clear] ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[voice/history/clear] error", err);
    return false;
  }
}

/**
 * POST /api/jarvis/voice/history/receipt
 *
 * Records the true terminal outcome of a desktop-gated WhatsApp send into the
 * server's cross-turn memory (jarvis_turns), so a following "did you send it?"
 * turn is answered from a real receipt rather than a guess. Fire-and-forget:
 * the send already succeeded/failed and was spoken; this only teaches the agent
 * what happened. Failures to POST are logged, never surfaced.
 */
export async function postWhatsappReceipt(args: {
  recipient: string;
  jid?: string;
  text: string;
  success: boolean;
  at?: string;
}): Promise<boolean> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  try {
    const res = await fetch(`${apiBaseUrl}/api/jarvis/voice/history/receipt`, {
      method: "POST",
      headers: {
        ...(await authHeaders(triggerSecret)),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        channel: "whatsapp",
        recipient: args.recipient,
        ...(args.jid ? { jid: args.jid } : {}),
        text: args.text,
        success: args.success,
        at: args.at ?? new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[voice/history/receipt] ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[voice/history/receipt] error", err);
    return false;
  }
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
// Startup config (web = source of truth; local Tauri store = offline fallback).
// The desktop reads the owner's canonical STARTUP config from the web on boot
// so editing it on the web JARVIS tab changes what the desktop does at session
// start (briefing toggle, apps/URLs to open, macOS Shortcuts to run). The local
// settings store is mirrored from this and used verbatim when the fetch fails.
// ---------------------------------------------------------------------------

/** One item the desktop opens on session-start. Mirrors StartupOpenItem in
 *  settings.ts and the web's StartupOpenTarget. */
export interface StartupConfigOpenItem {
  type: "url" | "app";
  value: string;
}

/** The web's canonical startup config, as returned by GET
 *  /api/jarvis/config/startup. Shapes match jarvis_startup_config. */
export interface StartupConfig {
  briefingEnabled: boolean;
  openOnStart: StartupConfigOpenItem[];
  startupShortcuts: string[];
}

/** Bound the boot-time fetch so a slow/dead server can never wedge session
 *  start — on timeout we abort and fall back to the local store. */
const STARTUP_CONFIG_TIMEOUT_MS = 4_000;

/** Narrow a raw openOnStart value from the wire: drop malformed entries. */
function coerceOpenItems(raw: unknown): StartupConfigOpenItem[] {
  if (!Array.isArray(raw)) return [];
  const items: StartupConfigOpenItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const type = (entry as Record<string, unknown>)["type"];
    const value = (entry as Record<string, unknown>)["value"];
    if ((type === "url" || type === "app") && typeof value === "string" && value.trim()) {
      items.push({ type, value: value.trim() });
    }
  }
  return items;
}

/** Narrow a raw shortcuts value from the wire: keep non-empty strings only. */
function coerceShortcuts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
    .map((name) => name.trim());
}

/**
 * GET /api/jarvis/config/startup
 * Reads the owner's canonical startup config (bearer + owner gated). Web is the
 * source of truth. Returns null on ANY failure — non-ok status, parse error,
 * transport failure, or the {@link STARTUP_CONFIG_TIMEOUT_MS} timeout — so the
 * caller can fall back to the local Tauri store and session start never blocks
 * on the network. The returned shapes are sanitized (malformed entries dropped)
 * so consumers always see well-formed values.
 */
export async function fetchStartupConfig(): Promise<StartupConfig | null> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), STARTUP_CONFIG_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBaseUrl}/api/jarvis/config/startup`, {
      method: "GET",
      headers: await authHeaders(triggerSecret),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[config/startup] GET ${res.status}`);
      return null;
    }
    const json = (await res.json()) as {
      briefingEnabled?: unknown;
      openOnStart?: unknown;
      startupShortcuts?: unknown;
    };
    return {
      briefingEnabled: typeof json.briefingEnabled === "boolean" ? json.briefingEnabled : true,
      openOnStart: coerceOpenItems(json.openOnStart),
      startupShortcuts: coerceShortcuts(json.startupShortcuts),
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[config/startup] GET failed", err);
    return null;
  } finally {
    clearTimeout(timer);
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

// ---------------------------------------------------------------------------
// Notification announcer — incoming-message polling.
// The desktop watcher polls these two read-only endpoints on a short interval
// while the HUD runs, passing the last-seen timestamp per channel so each poll
// returns only what is new. Both are fail-safe: any non-ok/parse/transport
// failure yields [] so a transient hiccup skips one tick rather than crashing
// the watcher loop.
// ---------------------------------------------------------------------------

/** One incoming message from either channel, normalized for the announcer.
 *  `chatJid` addresses the chat for the open-widget flow (WhatsApp); iMessage
 *  has no in-app widget yet, so its jid is carried but unused for summoning. */
export interface IncomingMessage {
  channel: "whatsapp" | "imessage";
  chatJid: string;
  senderName: string;
  body: string | null;
  sentAt: string;
}

/**
 * GET /api/studio/whatsapp?recent&since=<iso>
 * Newest incoming (not-from-me) WhatsApp messages since `since`, normalized to
 * IncomingMessage. Returns [] on any failure.
 */
export async function getWhatsappRecent(since: string | null): Promise<IncomingMessage[]> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  try {
    const qs = since ? `&since=${encodeURIComponent(since)}` : "";
    const res = await fetch(`${apiBaseUrl}/api/studio/whatsapp?recent${qs}`, {
      method: "GET",
      headers: await authHeaders(triggerSecret),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[whatsapp/recent] GET ${res.status}`);
      return [];
    }
    const json = (await res.json()) as {
      receipt?: {
        messages?: Array<{
          chatJid?: unknown;
          senderName?: unknown;
          body?: unknown;
          sentAt?: unknown;
        }>;
      };
    };
    const rows = json.receipt?.messages;
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((r) => {
      if (typeof r.chatJid !== "string" || typeof r.sentAt !== "string") return [];
      return [
        {
          channel: "whatsapp" as const,
          chatJid: r.chatJid,
          senderName: typeof r.senderName === "string" ? r.senderName : r.chatJid,
          body: typeof r.body === "string" ? r.body : null,
          sentAt: r.sentAt,
        },
      ];
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[whatsapp/recent] GET failed", err);
    return [];
  }
}

/**
 * GET /api/imessage/recent?since=<iso>
 * Newest incoming iMessages since `since`, normalized to IncomingMessage.
 * Returns [] on any failure.
 */
export async function getImessageRecent(since: string | null): Promise<IncomingMessage[]> {
  const { apiBaseUrl, triggerSecret } = getEnv();
  try {
    const qs = since ? `?since=${encodeURIComponent(since)}` : "";
    const res = await fetch(`${apiBaseUrl}/api/imessage/recent${qs}`, {
      method: "GET",
      headers: await authHeaders(triggerSecret),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[imessage/recent] GET ${res.status}`);
      return [];
    }
    const json = (await res.json()) as {
      messages?: Array<{
        chatJid?: unknown;
        senderName?: unknown;
        body?: unknown;
        sentAt?: unknown;
      }>;
    };
    const rows = json.messages;
    if (!Array.isArray(rows)) return [];
    return rows.flatMap((r) => {
      if (typeof r.chatJid !== "string" || typeof r.sentAt !== "string") return [];
      return [
        {
          channel: "imessage" as const,
          chatJid: r.chatJid,
          senderName: typeof r.senderName === "string" ? r.senderName : "Someone",
          body: typeof r.body === "string" ? r.body : null,
          sentAt: r.sentAt,
        },
      ];
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[imessage/recent] GET failed", err);
    return [];
  }
}

// Re-export the trigger-type alias so registry/dispatch code can import it
// alongside the client without a second jarvis-core import site.
export type { RoutineTriggerType };

