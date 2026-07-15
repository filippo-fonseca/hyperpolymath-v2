"use client";

import { useEffect, useState } from "react";
import { JarvisConsole } from "@/components/jarvis/JarvisConsole";
import {
  loadJarvisInit,
  type JarvisInitPayload,
} from "@/app/actions/jarvis-init";
import { KiwiIcon } from "@/components/shared/KiwiIcon";

/**
 * JarvisSidePanel — embedded JARVIS console for split-screen mode.
 *
 * Lazy: fetches its initial payload via the loadJarvisInit Server Action on
 * mount. Cached at the module level so re-mounting (e.g. toggling split off
 * and back on) is instant.
 *
 * Mounted only when split-screen is on, so the cost is paid on first activation
 * and never on regular page loads. Realtime + streaming flows inside
 * JarvisConsole work the same as on /today.
 */

let cached: JarvisInitPayload | null = null;
let inflight: Promise<JarvisInitPayload> | null = null;

function loadOnce(): Promise<JarvisInitPayload> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = loadJarvisInit().then((p) => {
    cached = p;
    inflight = null;
    return p;
  });
  return inflight;
}

export function JarvisSidePanel() {
  const [payload, setPayload] = useState<JarvisInitPayload | null>(cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (payload) return;
    let cancelled = false;
    loadOnce()
      .then((p) => {
        if (!cancelled) setPayload(p);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Failed to load JARVIS panel",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-[14px] text-[var(--ink)]">
          JARVIS panel failed to load
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          {error}
        </p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3"
        aria-busy
      >
        <KiwiIcon
          size={28}
          aria-hidden="true"
          className="text-[var(--hud-cyan)] animate-pulse"
        />
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          Loading JARVIS
        </p>
      </div>
    );
  }

  return (
    <JarvisConsole
      userId={payload.userId}
      userTimezone={payload.userTimezone}
      initialProjects={payload.initialProjects}
      initialHashtags={payload.initialHashtags}
      initialTurns={payload.initialTurns}
      initialHasMore={payload.initialHasMore}
      initialOldestAt={payload.initialOldestAt}
    />
  );
}
