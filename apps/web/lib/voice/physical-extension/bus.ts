import { EventEmitter } from "node:events";

import type {
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
