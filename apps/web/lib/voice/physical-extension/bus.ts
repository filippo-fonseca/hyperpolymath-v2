import { EventEmitter } from "node:events";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  PhysicalJarvisAck,
  PhysicalJarvisCancel,
  PhysicalJarvisResponseChunk,
  PhysicalJarvisResponseEnd,
  PhysicalJarvisResponseStart,
  PhysicalJarvisRoutineProgress,
  PhysicalJarvisToolCall,
  PhysicalStudioAction,
  PhysicalTranscript,
  PhysicalTrigger,
} from "@/lib/voice/physical-extension/types";

const g = globalThis as unknown as {
  __jarvisPhysicalBus?: EventEmitter;
  __jarvisPhysicalChannel?: RealtimeChannel | null;
};

export const physicalBus: EventEmitter =
  g.__jarvisPhysicalBus ?? (g.__jarvisPhysicalBus = new EventEmitter());

physicalBus.setMaxListeners(0);

const PHYSICAL_EVENTS = [
  "trigger",
  "transcript",
  "jarvis-response-start",
  "jarvis-response-chunk",
  "jarvis-tool-call",
  "studio-action",
  "jarvis-response-end",
  "jarvis-routine-progress",
  // Spoken tool-latency ack (played before the answer; never persisted).
  "jarvis-ack",
  // Real interrupt for the persistent-SSE voice path (cross-instance abort).
  "jarvis-cancel",
] as const;

// MAJOR-6 — `userId` is threaded through so SSE subscribers can filter
// (see /app/api/jarvis/physical/events/route.ts). Optional to keep the
// gate in this file soft during rollout; the SSE consumer treats a
// missing/mismatched userId as "not for me" and drops silently.
const StudioActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("open"),
      kind: z.enum([
        "browser",
        "whatsapp",
        "weather",
        "news",
        "home",
        "card",
        "clock",
        "camera",
        "settings",
      ]),
      props: z.record(z.string(), z.unknown()).optional(),
      userId: z.string().min(1).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("close"),
      kind: z.string().min(1),
      target: z.enum(["kind", "id"]).optional(),
      userId: z.string().min(1).optional(),
    })
    .strict(),
  // Hand-cursor toggle — flips the Studio HUD's webcam gesture pointer on/off.
  // Carries no widget kind; the desktop router maps enabled -> setHandEnabled.
  z
    .object({
      action: z.literal("hand"),
      enabled: z.boolean(),
      userId: z.string().min(1).optional(),
    })
    .strict(),
]);

type PhysicalEventName = (typeof PHYSICAL_EVENTS)[number];

const CHANNEL_NAME = "jarvis-physical-events";

// On Vercel, the producer (voice/transcript POST) and each SSE consumer can
// run in DIFFERENT lambda instances, so an in-memory EventEmitter alone
// drops events across instances. Supabase Realtime broadcast is the
// cross-instance transport; the local emit keeps same-instance latency at
// zero. __origin tags let the receiving side drop our own echoes.
const INSTANCE_ID = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

function getRealtimeChannel(): RealtimeChannel | null {
  if (g.__jarvisPhysicalChannel !== undefined) return g.__jarvisPhysicalChannel;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    g.__jarvisPhysicalChannel = null;
    return null;
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const channel = client.channel(CHANNEL_NAME, {
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: "*" }, (msg) => {
    const event = msg.event as PhysicalEventName;
    if (!PHYSICAL_EVENTS.includes(event)) return;
    const payload = (msg.payload ?? {}) as { __origin?: string } & Record<string, unknown>;
    if (payload.__origin === INSTANCE_ID) return;
    const { __origin: _origin, ...data } = payload;
    physicalBus.emit(event, data);
  });

  channel.subscribe();
  g.__jarvisPhysicalChannel = channel;
  return channel;
}

/** Start relaying cross-instance events onto the local bus. Call from any
 * route that LISTENS to physicalBus (i.e. the SSE events endpoint). */
export function ensurePhysicalRealtimeBridge(): void {
  getRealtimeChannel();
}

function emitEverywhere(event: PhysicalEventName, payload: object): void {
  physicalBus.emit(event, payload);
  const channel = getRealtimeChannel();
  if (channel) {
    void channel
      .send({
        type: "broadcast",
        event,
        payload: { ...payload, __origin: INSTANCE_ID },
      })
      .catch(() => {
        // Realtime down — same-instance listeners already got the event.
      });
  }
}

export function emitPhysicalTrigger(payload: PhysicalTrigger): void {
  emitEverywhere("trigger", payload);
}

export function emitPhysicalTranscript(payload: PhysicalTranscript): void {
  emitEverywhere("transcript", payload);
}

export function emitJarvisResponseStart(payload: PhysicalJarvisResponseStart): void {
  emitEverywhere("jarvis-response-start", payload);
}

export function emitJarvisResponseChunk(payload: PhysicalJarvisResponseChunk): void {
  emitEverywhere("jarvis-response-chunk", payload);
}

export function emitJarvisToolCall(payload: PhysicalJarvisToolCall): void {
  emitEverywhere("jarvis-tool-call", payload);
}

/**
 * Emit a studio widget action onto the physical bus.
 *
 * INVARIANT: this bus is a single global EventEmitter that fans out to every
 * SSE subscriber. The `/api/jarvis/physical/events` route currently gates
 * subscribers to the owner user (`isOwnerUser`), but the studio-action
 * pipeline itself has no per-user partition. The `userId` field on the
 * payload is the forward-compat plumbing that lets subscribers filter
 * (or a future partitioned bus route) events to the correct user.
 *
 * Callers should ALWAYS include `payload.userId` (the tool executor's
 * ctx.userId). Emitters that omit it will only reach subscribers if the
 * bus is ever relaxed to broadcast — hence the SSE consumer treats
 * missing userId as "not for this subscriber" and drops silently.
 */
export function emitStudioAction(payload: PhysicalStudioAction): void {
  const parsed = StudioActionSchema.safeParse(payload);
  if (!parsed.success) {
    console.warn("[physical-bus] refused invalid studio action", parsed.error.message);
    return;
  }
  emitEverywhere("studio-action", parsed.data);
}

export function emitJarvisResponseEnd(payload: PhysicalJarvisResponseEnd): void {
  emitEverywhere("jarvis-response-end", payload);
}

/**
 * Emit a spoken tool-latency ack. Routed on its own event so downstream TTS
 * speaks it (serialized before the answer by turnId) while it stays out of the
 * persisted transcript and the visual bubble.
 */
export function emitJarvisAck(payload: PhysicalJarvisAck): void {
  emitEverywhere("jarvis-ack", payload);
}

/**
 * Emit a cancel signal for the persistent-SSE voice path. Fans out cross-
 * instance (the turn may run in a different lambda than the cancel POST) so the
 * turn-abort registry on the turn's instance aborts the in-flight run.
 */
export function emitJarvisCancel(payload: PhysicalJarvisCancel): void {
  emitEverywhere("jarvis-cancel", payload);
}

export function emitJarvisRoutineProgress(payload: PhysicalJarvisRoutineProgress): void {
  emitEverywhere("jarvis-routine-progress", payload);
}
