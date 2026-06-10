"use client";

import { useEffect, useRef } from "react";

import type {
  PhysicalJarvisResponseChunk,
  PhysicalJarvisResponseEnd,
  PhysicalJarvisResponseStart,
  PhysicalJarvisToolCall,
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
            // The server already ran the JARVIS turn for this transcript
            // (voice/transcript route). Consumers must render it, not
            // re-submit it.
            source: "desktop",
          },
        }),
      );
    };

    const handleResponseStart = (e: MessageEvent<string>) => {
      let payload: PhysicalJarvisResponseStart | undefined;
      try {
        payload = JSON.parse(e.data) as PhysicalJarvisResponseStart;
      } catch {
        return;
      }
      window.dispatchEvent(
        new CustomEvent("jarvis-response-start", { detail: payload }),
      );
    };

    const handleResponseChunk = (e: MessageEvent<string>) => {
      let payload: PhysicalJarvisResponseChunk | undefined;
      try {
        payload = JSON.parse(e.data) as PhysicalJarvisResponseChunk;
      } catch {
        return;
      }
      window.dispatchEvent(
        new CustomEvent("jarvis-response-chunk", { detail: payload }),
      );
    };

    const handleToolCall = (e: MessageEvent<string>) => {
      let payload: PhysicalJarvisToolCall | undefined;
      try {
        payload = JSON.parse(e.data) as PhysicalJarvisToolCall;
      } catch {
        return;
      }
      window.dispatchEvent(
        new CustomEvent("jarvis-tool-call", { detail: payload }),
      );
    };

    const handleResponseEnd = (e: MessageEvent<string>) => {
      let payload: PhysicalJarvisResponseEnd | undefined;
      try {
        payload = JSON.parse(e.data) as PhysicalJarvisResponseEnd;
      } catch {
        return;
      }
      window.dispatchEvent(
        new CustomEvent("jarvis-response-end", { detail: payload }),
      );
    };

    source.addEventListener("trigger", handleTrigger as EventListener);
    source.addEventListener("transcript", handleTranscript as EventListener);
    source.addEventListener("jarvis-response-start", handleResponseStart as EventListener);
    source.addEventListener("jarvis-response-chunk", handleResponseChunk as EventListener);
    source.addEventListener("jarvis-tool-call", handleToolCall as EventListener);
    source.addEventListener("jarvis-response-end", handleResponseEnd as EventListener);

    source.onerror = () => {
      // eslint-disable-next-line no-console
      console.warn("[physical-extension] SSE connection error — auto-reconnecting");
    };

    return () => {
      source.removeEventListener("trigger", handleTrigger as EventListener);
      source.removeEventListener("transcript", handleTranscript as EventListener);
      source.removeEventListener("jarvis-response-start", handleResponseStart as EventListener);
      source.removeEventListener("jarvis-response-chunk", handleResponseChunk as EventListener);
      source.removeEventListener("jarvis-tool-call", handleToolCall as EventListener);
      source.removeEventListener("jarvis-response-end", handleResponseEnd as EventListener);
      source.close();
      sourceRef.current = null;
    };
  }, [enabled]);
}
