"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Phase 6.1 Plan 06.1-01: HudEdgeInstrumentation shared primitive
 * (UI-SPEC §5a, §6d, §10c).
 *
 * Bottom-edge telemetry rail. Mono 11px uppercase tracking-wide labels
 * showing LATENCY · CACHE · LAST. Each numeric value plays the
 * `.hud-edge-tick` 120ms color flash when its underlying prop changes
 * (driven by the useTickOnChange hook below).
 *
 * Layout: `hidden md:flex` per UI-SPEC §10c (drops below 768px to
 * preserve mobile vertical real estate; underlying data is available
 * on /insights for users who want it).
 *
 * Visual register: opacity-40 at rest, hover:opacity-85 (UI-SPEC §6d).
 * Decorative — aria-hidden="true".
 *
 * Consumed by Plan 02 (JARVIS Console chrome) and Plan 03 (/insights
 * chart panels + /health viewport).
 */

interface HudEdgeInstrumentationProps {
  /** Latest turn latency in ms. Null renders as "—ms". */
  latencyMs: number | null;
  /** Prompt-cache hit rate as percentage (0–100). Null renders as "—%". */
  cacheHitPercent: number | null;
  /** Relative time of last JARVIS turn (e.g., "12s ago"). Null renders as "—". */
  lastTurnRelative: string | null;
  /** Additional positioning class (e.g., absolute bottom-2 inset-x-0). */
  className?: string;
}

/**
 * Returns true for 120ms each time `value` changes (via referential
 * inequality). Consumer applies `.hud-edge-tick` while the flag is true.
 */
function useTickOnChange<T>(value: T): boolean {
  const prev = useRef<T>(value);
  const [tick, setTick] = useState(false);

  useEffect(() => {
    if (prev.current !== value) {
      setTick(true);
      prev.current = value;
      const id = setTimeout(() => setTick(false), 120);
      return () => clearTimeout(id);
    }
  }, [value]);

  return tick;
}

export function HudEdgeInstrumentation({
  latencyMs,
  cacheHitPercent,
  lastTurnRelative,
  className = "",
}: HudEdgeInstrumentationProps) {
  const latencyTick = useTickOnChange(latencyMs);
  const cacheTick = useTickOnChange(cacheHitPercent);
  const lastTick = useTickOnChange(lastTurnRelative);

  return (
    <div
      className={`hidden md:flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)] opacity-40 hover:opacity-85 transition-opacity duration-200 ease-out ${className}`}
      aria-hidden="true"
    >
      <span className="text-[var(--ink-muted)]">╶──</span>
      <span>
        <span>LATENCY </span>
        <span className={latencyTick ? "hud-edge-tick" : ""}>
          {latencyMs == null ? "—ms" : `${latencyMs}ms`}
        </span>
      </span>
      <span>·</span>
      <span>
        <span>CACHE </span>
        <span className={cacheTick ? "hud-edge-tick" : ""}>
          {cacheHitPercent == null ? "—%" : `${cacheHitPercent}%`}
        </span>
      </span>
      <span>·</span>
      <span>
        <span>LAST </span>
        <span className={lastTick ? "hud-edge-tick" : ""}>{lastTurnRelative ?? "—"}</span>
      </span>
      <span className="text-[var(--ink-muted)]">──╴</span>
    </div>
  );
}
