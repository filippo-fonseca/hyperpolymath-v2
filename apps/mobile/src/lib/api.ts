// HTTP client for the JARVIS server — mirrors apps/desktop/src/api/client.ts.
// Auth is the device bearer token minted at /settings/desktop (hpd_...);
// validateDesktopBearer on the server maps it to a userId.
//
// Uses expo/fetch (WinterCG-compliant) so typed-array bodies and
// arrayBuffer() responses behave correctly on iOS.

import { fetch } from "expo/fetch";

import { authHeaders } from "./auth-token";
import { getSettings } from "./settings";

function baseUrl(): string {
  return getSettings().serverUrl.replace(/\/$/, "");
}

/**
 * POST /api/jarvis/voice/transcript
 * Uploads the recorded WAV. The server runs Groq STT, spawns the JARVIS
 * turn, and streams the response over the physical SSE bus.
 */
export async function postTranscript(args: {
  wav: Uint8Array<ArrayBuffer>;
  vadEndAt: number;
}): Promise<{ transcript: string; turnId?: string } | null> {
  try {
    const res = await fetch(`${baseUrl()}/api/jarvis/voice/transcript`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "content-type": "audio/wav",
        "x-jarvis-vad-end-at": String(args.vadEndAt),
      },
      body: args.wav,
    });
    if (!res.ok) {
      console.warn(`[transcript] ${res.status}`);
      return null;
    }
    return (await res.json()) as { transcript: string; turnId?: string };
  } catch (err) {
    console.warn("[transcript] request failed", err);
    return null;
  }
}

// ContentBlock mirrors the Anthropic API content-block shapes used in history.
export type HistoryContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export type HistoryEntry = {
  role: "user" | "assistant";
  content: string | HistoryContentBlock[];
};

export interface PostTextOptions {
  parsedDates?: Array<{ text: string; start: string; end?: string; allDay?: boolean }>;
  parsedPriority?: "P∞" | "P1" | "P2" | "P3" | null;
  slashCommand?: "task" | "capture" | "event" | "ask" | null;
  linkedProjectIds?: string[];
  linkedHashtags?: string[];
  /** Conversation history — last N turns in Anthropic content-block format. */
  history?: HistoryEntry[];
}

/**
 * POST /api/jarvis/voice/text
 * Text-bar fallback — same server-side turn as voice, minus STT. Carries
 * the full composer payload (slash forcing, pre-parsed dates/priority,
 * linked refs) mirroring the browser console.
 */
export async function postText(
  text: string,
  options: PostTextOptions = {},
): Promise<{ turnId: string } | null> {
  try {
    const res = await fetch(`${baseUrl()}/api/jarvis/voice/text`, {
      method: "POST",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        text,
        parsedDates: options.parsedDates?.length ? options.parsedDates : undefined,
        parsedPriority: options.parsedPriority ?? undefined,
        slashCommand: options.slashCommand ?? undefined,
        linkedProjectIds: options.linkedProjectIds?.length ? options.linkedProjectIds : undefined,
        linkedHashtags: options.linkedHashtags?.length ? options.linkedHashtags : undefined,
        history: options.history?.length ? options.history : undefined,
      }),
    });
    if (!res.ok) {
      console.warn(`[text] ${res.status}`);
      return null;
    }
    return (await res.json()) as { turnId: string };
  } catch (err) {
    console.warn("[text] request failed", err);
    return null;
  }
}

/**
 * POST /api/jarvis/tts
 * Returns raw 16-bit signed LE PCM @ 24kHz mono (no WAV header), or null.
 */
export async function fetchTtsPcm(args: {
  text: string;
  voiceId?: string;
}): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${baseUrl()}/api/jarvis/tts`, {
      method: "POST",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ text: args.text, voiceId: args.voiceId }),
    });
    if (!res.ok) {
      console.warn(`[tts] ${res.status}`);
      return null;
    }
    const buf = await res.arrayBuffer();
    return buf.byteLength ? new Uint8Array(buf) : null;
  } catch (err) {
    console.warn("[tts] request failed", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// UndoTarget — full 9-kind union mirroring apps/web/lib/jarvis/undo.ts.
// The server route /api/jarvis/voice/undo accepts all 9 kinds.
// ---------------------------------------------------------------------------

/** Fields that may be reverted for a task update undo. */
export interface TaskBefore {
  title?: string;
  notes?: string | null;
  priority?: "P∞" | "P1" | "P2" | "P3";
  status?: string;
  dueDate?: string | null;
}

/** Fields that may be reverted for a capture update undo. */
export interface CaptureBefore {
  content?: string;
}

/** Fields that may be reverted for an event update undo. */
export interface EventBefore {
  summary?: string;
  description?: string | null;
  start?: Record<string, unknown>;
  end?: Record<string, unknown>;
}

/** Minimal task snapshot for delete undo (re-insert). */
export interface TaskSnapshot {
  id: string;
  title: string;
  notes?: string | null;
  priority: "P∞" | "P1" | "P2" | "P3";
  status: string;
  dueDate?: string | null;
  [key: string]: unknown;
}

/** Minimal capture snapshot for delete undo (re-insert). */
export interface CaptureSnapshot {
  id: string;
  content: string;
  [key: string]: unknown;
}

export type UndoTarget =
  // Create undo — delete the created entity
  | { kind: "task"; id: string }
  | { kind: "capture"; id: string }
  | { kind: "event"; id: string; calendarId: string }
  // Update undo — restore `before` field values
  | { kind: "update_task"; id: string; before: TaskBefore }
  | { kind: "update_capture"; id: string; before: CaptureBefore }
  | { kind: "update_event"; id: string; calendarId: string; before: EventBefore }
  // Delete undo — recreate the entity from a pre-delete snapshot
  | { kind: "delete_task"; snapshot: TaskSnapshot }
  | { kind: "delete_capture"; snapshot: CaptureSnapshot }
  | { kind: "delete_event"; calendarId: string; snapshot: Record<string, unknown> };

/** POST /api/jarvis/voice/undo — the 5s receipt undo, paired-device twin. */
export async function postUndo(target: UndoTarget): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl()}/api/jarvis/voice/undo`, {
      method: "POST",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify(target),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}

export interface TurnSnapshot {
  status: "pending" | "done" | "error";
  text?: string;
  actions?: Array<{ toolUseId: string; name: string; result: unknown }>;
  errorMessage?: string | null;
}

/**
 * GET /api/jarvis/voice/turn?id=… — reconciliation fallback when the SSE
 * stream misses events (backgrounded app, dropped socket).
 */
export async function fetchTurn(turnId: string): Promise<TurnSnapshot | null> {
  try {
    const res = await fetch(`${baseUrl()}/api/jarvis/voice/turn?id=${turnId}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    return (await res.json()) as TurnSnapshot;
  } catch {
    return null;
  }
}

/** Quick connectivity + auth probe used by the settings sheet. */
export async function probeConnection(): Promise<
  "ok" | "voice-only" | "unauthorized" | "unreachable"
> {
  try {
    const res = await fetch(`${baseUrl()}/api/jarvis/voice/text`, {
      method: "POST",
      headers: { ...authHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    if (res.status === 401) return "unauthorized";
    // The text route may not be deployed yet — fall back to probing the
    // voice transcript route, which 401s without a valid bearer and 400s
    // (empty body) with one.
    if (res.status === 404) {
      const voiceRes = await fetch(`${baseUrl()}/api/jarvis/voice/transcript`, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "audio/wav" },
      });
      if (voiceRes.status === 401) return "unauthorized";
      return "voice-only";
    }
    // 400 "Empty text" means we authenticated and reached the route.
    return "ok";
  } catch {
    return "unreachable";
  }
}
