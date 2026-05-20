"use client";

import { useEffect, useRef } from "react";
import { CLAP_WORKLET_URL, CLAP_PROCESSOR_NAME } from "@/lib/voice/constants";

interface Params {
  enabled: boolean;
  audioContext: AudioContext | null;
  stream: MediaStream | null;
  onDoubleClap: () => void;
}

/**
 * Phase 7 Plan 07-03 — AudioWorklet bridge for clap-clap activation (VOICE-03).
 *
 * Loads the static-asset processor from /worklets/clap-detector.js,
 * pipes the mic MediaStream through a MediaStreamAudioSourceNode →
 * AudioWorkletNode, and surfaces `{ type: 'double-clap' }` messages
 * via the onDoubleClap callback.
 *
 * The 250-650ms inter-clap window is enforced INSIDE the worklet
 * processor (see public/worklets/clap-detector.js). This hook is a
 * thin bridge — no timing logic lives here.
 *
 * Critical: do NOT connect workletNode to audioContext.destination —
 * the clap detector is a read-only analysis node, not a sound producer.
 */
export function useClapDetector({
  enabled,
  audioContext,
  stream,
  onDoubleClap,
}: Params) {
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  // Use a ref for the callback to avoid stale closure issues in the
  // worklet port handler without requiring the effect to re-run.
  const callbackRef = useRef(onDoubleClap);
  callbackRef.current = onDoubleClap;

  useEffect(() => {
    if (!enabled || !audioContext || !stream) return;

    let cancelled = false;

    (async () => {
      try {
        await audioContext.audioWorklet.addModule(CLAP_WORKLET_URL);
        if (cancelled) return;

        const sourceNode = audioContext.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioContext, CLAP_PROCESSOR_NAME);

        workletNode.port.onmessage = (e: MessageEvent) => {
          if (e.data?.type === "double-clap") {
            callbackRef.current();
          }
        };

        // Connect source → worklet (analysis only — NOT to destination)
        sourceNode.connect(workletNode);

        sourceNodeRef.current = sourceNode;
        workletNodeRef.current = workletNode;
      } catch (err) {
        console.warn("[clap-detector] failed to initialise AudioWorklet", err);
      }
    })();

    return () => {
      cancelled = true;
      try {
        sourceNodeRef.current?.disconnect();
      } catch {
        // Ignore disconnect errors on cleanup
      }
      try {
        workletNodeRef.current?.disconnect();
      } catch {
        // Ignore disconnect errors on cleanup
      }
      sourceNodeRef.current = null;
      workletNodeRef.current = null;
    };
  }, [enabled, audioContext, stream]);
}
