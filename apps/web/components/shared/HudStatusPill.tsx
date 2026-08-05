"use client";

/**
 * Phase 6.1 Plan 06.1-02: HudStatusPill — JARVIS Console + /health status pill.
 *
 * Renders the 6-state status vocabulary from UI-SPEC §9f + §12c:
 *
 *   READY  — idle, --ink-muted text, --edge-hud border, --hud-cyan dot
 *   SENDING — submit window, --hud-cyan text, --hud-cyan border, --hud-cyan-bright dot
 *   THINKING — model latency, --hud-cyan text, --hud-cyan border, --ink-amber dot
 *   STREAMING — tokens flowing, --hud-cyan text + --hud-cyan-glow bg, --hud-cyan-bright dot
 *   ERROR — failure, --ink-coral text + border + dot
 *   UNDO 5s — 5s undo window, --ink-amber text + dot, --edge-hud border, countdown suffix
 *
 * Container: px-2 py-0.5, font-mono 11px uppercase tracking-[0.08em],
 * 6px filled leading dot, 240ms scale-pulse on every state change.
 *
 * aria-live="polite" — screen readers announce state changes (e.g.,
 * "JARVIS status: thinking") without interrupting prose reading.
 *
 * Reduced-motion: Motion 12's keyed re-animate naturally cancels under
 * useReducedMotion, but the consumer doesn't need to wire that — the
 * dot pulse is a 200ms one-shot, not a loop.
 */

import { motion } from "motion/react";

export type HudStatusState =
  | "ready"
  | "sending"
  | "thinking"
  | "streaming"
  | "error"
  | "undo";

interface HudStatusPillProps {
  state: HudStatusState;
  /** When state === "undo", appended as " {N}s" suffix to the label. */
  undoSecondsRemaining?: number;
  className?: string;
}

interface StateConfig {
  label: string;
  dot: string;
  text: string;
  border: string;
  bg: string;
}

const stateConfig: Record<HudStatusState, StateConfig> = {
  ready: {
    label: "READY",
    dot: "var(--hud-cyan)",
    text: "var(--ink-muted)",
    border: "var(--edge-hud)",
    bg: "transparent",
  },
  sending: {
    label: "SENDING",
    dot: "var(--hud-cyan-bright)",
    text: "var(--hud-cyan)",
    border: "var(--hud-cyan)",
    bg: "transparent",
  },
  thinking: {
    label: "THINKING",
    dot: "var(--ink-amber)",
    text: "var(--hud-cyan)",
    border: "var(--hud-cyan)",
    bg: "transparent",
  },
  streaming: {
    label: "STREAMING",
    dot: "var(--hud-cyan-bright)",
    text: "var(--hud-cyan)",
    border: "var(--hud-cyan)",
    bg: "var(--hud-cyan-glow)",
  },
  error: {
    label: "ERROR",
    dot: "var(--ink-coral)",
    text: "var(--ink-coral)",
    border: "var(--ink-coral)",
    bg: "transparent",
  },
  undo: {
    label: "UNDO",
    dot: "var(--ink-amber)",
    text: "var(--ink-amber)",
    border: "var(--edge-hud)",
    bg: "transparent",
  },
};

export function HudStatusPill({
  state,
  undoSecondsRemaining,
  className = "",
}: HudStatusPillProps) {
  const cfg = stateConfig[state];
  const displayLabel =
    state === "undo" && undoSecondsRemaining != null
      ? `${cfg.label} ${undoSecondsRemaining}s`
      : cfg.label;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`JARVIS status: ${state}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-micro transition-colors duration-200 ease-out ${className}`}
      style={{
        color: cfg.text,
        backgroundColor: cfg.bg,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {/* Motion 12: re-keyed on state change → triggers 240ms scale pulse 1 → 1.4 → 1 */}
      <motion.span
        key={state}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.4, 1] }}
        transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
        className="inline-block w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: cfg.dot }}
        aria-hidden="true"
      />
      <span>{displayLabel}</span>
    </div>
  );
}
