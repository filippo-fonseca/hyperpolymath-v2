"use client";

import { useEffect, useRef, useState } from "react";

const STATUS_ENDPOINT = "/api/jarvis/voice/source/status";
/** Poll every 2.5 s. Heartbeat TTL = 30 s, desktop beats every ~10 s.
 *  2.5 s polling gives sub-3 s mic-restore when the desktop quits. */
const POLL_INTERVAL_MS = 2_500;

interface VoiceSourceStatus {
  desktopClaimed: boolean;
  expiresAt: number | null;
}

interface UseVoiceSourceStatusResult {
  desktopClaimed: boolean;
  isLoading: boolean;
}

/**
 * Polls GET /api/jarvis/voice/source/status every 2.5 s.
 *
 * Returns { desktopClaimed, isLoading }:
 *   - isLoading is true only on the initial fetch (before the first
 *     response lands). After that, stale desktopClaimed is never shown
 *     to callers — the last known value persists until the next poll.
 *   - desktopClaimed defaults to false during the loading window so
 *     the mic infrastructure is NOT blocked before we know the real state.
 *     This is intentionally conservative: it's better to briefly allow
 *     the mic (and show no Safari prompt because voiceEnabled is false
 *     by default) than to block it when the desktop may not be running.
 */
export function useVoiceSourceStatus(): UseVoiceSourceStatusResult {
  const [status, setStatus] = useState<VoiceSourceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Stable ref to avoid re-creating the interval on re-renders.
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    async function fetchStatus() {
      try {
        const res = await fetch(STATUS_ENDPOINT, {
          // No-store so we always get a fresh server response, not a
          // cached stale value.  The endpoint is tiny (< 100 bytes).
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as VoiceSourceStatus;
        if (isMountedRef.current) {
          setStatus(data);
          setIsLoading(false);
        }
      } catch {
        // Network error — keep the previous state rather than flipping
        // desktopClaimed on transient failures.  isLoading stays false
        // after the first successful fetch regardless.
      }
    }

    // Fire immediately on mount, then poll.
    void fetchStatus();
    const id = setInterval(() => {
      void fetchStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      clearInterval(id);
    };
  }, []);

  return {
    desktopClaimed: status?.desktopClaimed ?? false,
    isLoading,
  };
}
