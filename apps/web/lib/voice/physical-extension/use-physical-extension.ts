"use client";

import { useEffect, useRef } from "react";

import type {
  PhysicalTranscript,
  PhysicalTrigger,
} from "@/lib/voice/physical-extension/types";

const SSE_ENDPOINT = "/api/jarvis/physical/events";

const WAKE_FIRE_EVENT = "jarvis-wake-fire";
const VOICE_TRANSCRIPT_EVENT = "jarvis-voice-transcript";

export function usePhysicalExtension(enabled: boolean): void {
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const source = new EventSource(SSE_ENDPOINT);
    sourceRef.current = source;

    const handleTrigger = (e: MessageEvent<string>) => {
      let payload: PhysicalTrigger | undefined;
      try {
        payload = JSON.parse(e.data) as PhysicalTrigger;
      } catch {
        return;
      }
      if (payload.desktopClaimed === true) {
        // Desktop daemon owns the mic — do NOT activate browser mic.
        return;
      }
      window.dispatchEvent(
        new CustomEvent<PhysicalTrigger>(WAKE_FIRE_EVENT, { detail: payload }),
      );
    };

    const handleTranscript = (e: MessageEvent<string>) => {
      let payload: PhysicalTranscript | undefined;
      try {
        payload = JSON.parse(e.data) as PhysicalTranscript;
      } catch {
        return;
      }
      window.dispatchEvent(
        new CustomEvent(VOICE_TRANSCRIPT_EVENT, {
          detail: {
            transcript: payload.transcript,
            sttDoneAt: payload.sttDoneAt,
            vadEndAt: payload.vadEndAt,
          },
        }),
      );
    };

    source.addEventListener("trigger", handleTrigger as EventListener);
    source.addEventListener("transcript", handleTranscript as EventListener);

    source.onerror = () => {
      // EventSource auto-reconnects; just log.
      // eslint-disable-next-line no-console
      console.warn("[physical-extension] SSE connection error — auto-reconnecting");
    };

    return () => {
      source.removeEventListener("trigger", handleTrigger as EventListener);
      source.removeEventListener("transcript", handleTranscript as EventListener);
      source.close();
      sourceRef.current = null;
    };
  }, [enabled]);
}
