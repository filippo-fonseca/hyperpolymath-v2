"use client";

import { Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PolypadConnectionState } from "@/lib/polypad/polypad-state-bus";

interface Props {
  state: PolypadConnectionState;
  collapsed: boolean;
}

/**
 * Polypad device connection indicator — mirrors MicIndicatorDot register.
 *
 * Same visual family as the mic dot (w-2 h-2 rounded-full, --hud-cyan
 * vocabulary, hud-pulse-slow keyframe reuse). Lives in PersistentNav's
 * voice status row next to MicIndicatorDot.
 *
 * State-to-CSS mapping:
 *   disconnected : --ink-muted opacity 0.4, no motion
 *   connected    : --hud-cyan opacity 1.0, slow pulse 1.2s ease-in-out
 *   error        : --ink-coral opacity 1.0, no motion
 *
 * `motion-reduce:animate-none` kills the keyframe when the user prefers
 * reduced motion (Tailwind utility — same spirit as the mic precedent).
 *
 * `data-polypad-state` is the grep target for verification and CSS targeting.
 *
 * Per locked decisions: presentational only (no onClick), native title for
 * tooltip (no Radix), keyboard icon + "POLYPAD" mono label visible only in
 * expanded sidebar mode.
 */

const STATE_CLASS: Record<PolypadConnectionState, string> = {
  disconnected: "opacity-40 bg-[var(--ink-muted)]",
  connected:
    "opacity-100 bg-[var(--hud-cyan)] animate-[hud-pulse-slow_1.2s_ease-in-out_infinite]",
  error: "opacity-100 bg-[var(--ink-coral)]",
};

const STATE_TITLE: Record<PolypadConnectionState, string> = {
  disconnected: "Polypad: disconnected",
  connected: "Polypad: connected",
  error: "Polypad: error",
};

export function PolypadIndicatorDot({ state, collapsed }: Props) {
  return (
    <span
      className="inline-flex items-center gap-1.5"
      title={STATE_TITLE[state]}
      aria-label={STATE_TITLE[state]}
    >
      {!collapsed && (
        <Keyboard
          size={12}
          strokeWidth={1.5}
          aria-hidden="true"
          className="text-[var(--ink-muted)]"
        />
      )}
      <span
        data-polypad-state={state}
        className={cn(
          "inline-block w-2 h-2 rounded-full transition-all duration-200 ease-out motion-reduce:animate-none",
          STATE_CLASS[state],
        )}
      />
      {!collapsed && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
          POLYPAD
        </span>
      )}
    </span>
  );
}
