import { EventEmitter } from "node:events";

import type {
  PhysicalJarvisResponseChunk,
  PhysicalJarvisResponseEnd,
  PhysicalJarvisResponseStart,
  PhysicalJarvisToolCall,
  PhysicalTranscript,
  PhysicalTrigger,
} from "@/lib/voice/physical-extension/types";

const g = globalThis as unknown as { __jarvisPhysicalBus?: EventEmitter };

export const physicalBus: EventEmitter =
  g.__jarvisPhysicalBus ?? (g.__jarvisPhysicalBus = new EventEmitter());

physicalBus.setMaxListeners(0);

export function emitPhysicalTrigger(payload: PhysicalTrigger): void {
  physicalBus.emit("trigger", payload);
}

export function emitPhysicalTranscript(payload: PhysicalTranscript): void {
  physicalBus.emit("transcript", payload);
}

export function emitJarvisResponseStart(payload: PhysicalJarvisResponseStart): void {
  physicalBus.emit("jarvis-response-start", payload);
}

export function emitJarvisResponseChunk(payload: PhysicalJarvisResponseChunk): void {
  physicalBus.emit("jarvis-response-chunk", payload);
}

export function emitJarvisToolCall(payload: PhysicalJarvisToolCall): void {
  physicalBus.emit("jarvis-tool-call", payload);
}

export function emitJarvisResponseEnd(payload: PhysicalJarvisResponseEnd): void {
  physicalBus.emit("jarvis-response-end", payload);
}
