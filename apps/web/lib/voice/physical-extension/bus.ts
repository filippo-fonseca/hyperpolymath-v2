import { EventEmitter } from "node:events";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

import type {
  PhysicalJarvisResponseChunk,
  PhysicalJarvisResponseEnd,
  PhysicalJarvisResponseStart,
  PhysicalJarvisRoutineProgress,
  PhysicalJarvisToolCall,
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
  "jarvis-response-end",
  "jarvis-routine-progress",
] as const;

type PhysicalEventName = (typeof PHYSICAL_EVENTS)[number];

const CHANNEL_NAME = "jarvis-physical-events";

// On Vercel, the producer (voice/transcript POST) and each SSE consumer can
// run in DIFFERENT lambda instances, so an in-memory EventEmitter alone
// drops events across instances. Supabase Realtime broadcast is the
// cross-instance transport; the local emit keeps same-instance latency at
// zero. __origin tags let the receiving side drop our own echoes.
const INSTANCE_ID =
  globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);

function getRealtimeChannel(): RealtimeChannel | null {
  if (g.__jarvisPhysicalChannel !== undefined) return g.__jarvisPhysicalChannel;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
    const payload = (msg.payload ?? {}) as { __origin?: string } & Record<
      string,
      unknown
    >;
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

export function emitJarvisResponseEnd(payload: PhysicalJarvisResponseEnd): void {
  emitEverywhere("jarvis-response-end", payload);
}

export function emitJarvisRoutineProgress(payload: PhysicalJarvisRoutineProgress): void {
  emitEverywhere("jarvis-routine-progress", payload);
}
