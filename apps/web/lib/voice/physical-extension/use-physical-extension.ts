"use client";

import { useEffect, useRef } from "react";

import type { PhysicalTrigger } from "@/lib/voice/physical-extension/types";

const SSE_ENDPOINT = "/api/jarvis/physical/events";

const WAKE_FIRE_EVENT = "jarvis-wake-fire";

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
      window.dispatchEvent(
        new CustomEvent<PhysicalTrigger>(WAKE_FIRE_EVENT, { detail: payload }),
      );
    };

    source.addEventListener("trigger", handleTrigger as EventListener);

    source.onerror = () => {
      // EventSource auto-reconnects; just log.
      // eslint-disable-next-line no-console
      console.warn("[physical-extension] SSE connection error — auto-reconnecting");
    };

    return () => {
      source.removeEventListener("trigger", handleTrigger as EventListener);
      source.close();
      sourceRef.current = null;
    };
  }, [enabled]);
}
