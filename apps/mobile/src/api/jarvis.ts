// HTTP client for the JARVIS voice endpoints. Auth is a Supabase access JWT
// (Google OAuth) or a legacy `hpd_…` device token; the server's
// validateDesktopBearer accepts both. POSTs return `{turnId}` immediately —
// the actual response streams over the physical SSE bus (see ./sse.ts).
//
// Also owns the composer context (projects/hashtags/timezone), fixed in v2
// to authenticate with getAuthBearer() — the v1 module used the raw device
// token and silently no-oped for Google-OAuth users.

import { fetch } from "expo/fetch";

import { authHeaders } from "../lib/auth-token";
import { apiBase, call, jsonHeaders } from "./http";

// ── Turn submission ─────────────────────────────────────────────────────────

/**
 * POST /api/jarvis/voice/transcript
 * Uploads the recorded WAV. The server runs STT, spawns the JARVIS turn, and
 * streams the response over the physical SSE bus.
 */
export async function postTranscript(args: {
  wav: Uint8Array<ArrayBuffer>;
  vadEndAt: number;
}): Promise<{ transcript: string; turnId?: string } | null> {
  try {
    const res = await fetch(`${apiBase()}/api/jarvis/voice/transcript`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "content-type": "audio/wav",
        "x-jarvis-vad-end-at": String(args.vadEndAt),
      },
      body: args.wav,
    });
    if (!res.ok) {
      console.warn(`[jarvis] transcript → ${res.status}`);
      return null;
    }
    return (await res.json()) as { transcript: string; turnId?: string };
  } catch (err) {
    console.warn("[jarvis] transcript failed", err);
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
 * Text-composer path — same server-side turn as voice, minus STT. Carries the
 * full composer payload (slash forcing, pre-parsed dates/priority, linked
 * refs) mirroring the browser console.
 */
export async function postText(
  text: string,
  options: PostTextOptions = {},
): Promise<{ turnId: string } | null> {
  return call<{ turnId: string }>("/api/jarvis/voice/text", {
    method: "POST",
    body: {
      text,
      parsedDates: options.parsedDates?.length ? options.parsedDates : undefined,
      parsedPriority: options.parsedPriority ?? undefined,
      slashCommand: options.slashCommand ?? undefined,
      linkedProjectIds: options.linkedProjectIds?.length
        ? options.linkedProjectIds
        : undefined,
      linkedHashtags: options.linkedHashtags?.length
        ? options.linkedHashtags
        : undefined,
      history: options.history?.length ? options.history : undefined,
    },
  });
}

/**
 * POST /api/jarvis/voice/cancel
 * Interrupts an in-flight turn. `turnId` targets the active run when known;
 * `all` is the safe barge-in fallback.
 */
export async function postCancelTurn(args: {
  turnId?: string;
  all?: boolean;
}): Promise<boolean> {
  const data = await call<{ ok?: boolean }>("/api/jarvis/voice/cancel", {
    method: "POST",
    body: args.turnId ? { turnId: args.turnId } : { all: args.all === true },
  });
  return data?.ok === true;
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
    const res = await fetch(`${apiBase()}/api/jarvis/tts`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ text: args.text, voiceId: args.voiceId }),
    });
    if (!res.ok) {
      console.warn(`[jarvis] tts → ${res.status}`);
      return null;
    }
    const buf = await res.arrayBuffer();
    return buf.byteLength ? new Uint8Array(buf) : null;
  } catch (err) {
    console.warn("[jarvis] tts failed", err);
    return null;
  }
}

// ── Undo (5s receipt undo, paired-device twin of web) ───────────────────────

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

/** POST /api/jarvis/voice/undo. */
export async function postUndo(target: UndoTarget): Promise<boolean> {
  const data = await call<{ ok?: boolean }>("/api/jarvis/voice/undo", {
    method: "POST",
    body: target,
  });
  return data?.ok === true;
}

// ── Turn reconciliation ──────────────────────────────────────────────────────

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
  return call<TurnSnapshot>(`/api/jarvis/voice/turn?id=${encodeURIComponent(turnId)}`);
}

/** Quick connectivity + auth probe used by the settings screen. */
export async function probeConnection(): Promise<
  "ok" | "voice-only" | "unauthorized" | "unreachable"
> {
  try {
    const res = await fetch(`${apiBase()}/api/jarvis/voice/text`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ text: "" }),
    });
    if (res.status === 401) return "unauthorized";
    // The text route may not be deployed — fall back to the voice transcript
    // route, which 401s without a valid bearer and 400s (empty body) with one.
    if (res.status === 404) {
      const voiceRes = await fetch(`${apiBase()}/api/jarvis/voice/transcript`, {
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

// ── Composer context (projects / hashtags / timezone) ───────────────────────

export interface ProjectRef {
  id: string;
  name: string;
  icon: string | null;
}

export interface HashtagRef {
  name: string;
  displayName: string;
}

export interface JarvisContext {
  projects: ProjectRef[];
  hashtags: HashtagRef[];
  timezone: string;
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

let cachedContext: JarvisContext = {
  projects: [],
  hashtags: [],
  timezone: deviceTimezone(),
};

export function getJarvisContext(): JarvisContext {
  return cachedContext;
}

/**
 * GET /api/jarvis/voice/context with the resolved bearer (Supabase JWT or
 * device token) — v1 used the device token only, which no-oped for
 * Google-OAuth users.
 */
export async function refreshJarvisContext(): Promise<JarvisContext> {
  const data = await call<{
    projects?: ProjectRef[];
    hashtags?: HashtagRef[];
    timezone?: string | null;
  }>("/api/jarvis/voice/context");
  if (data) {
    cachedContext = {
      projects: data.projects ?? [],
      hashtags: data.hashtags ?? [],
      timezone: data.timezone || deviceTimezone(),
    };
  }
  return cachedContext;
}
