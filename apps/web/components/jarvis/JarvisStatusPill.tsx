"use client";

/**
 * JarvisStatusPill — the console's top-right status indicator.
 *
 * Local, SDC-1 §2.4-compliant replacement for the shared HudStatusPill
 * (components/shared/HudStatusPill.tsx), whose caps register (font-mono
 * 11px uppercase tracking-[0.08em] with hardcoded all-caps labels) is
 * banned outside kbd hints and sidebar eyebrows. Only the JARVIS Console
 * consumed the shared pill, but globals.css/shared primitives are outside
 * this lane's ownership, so the compliant version lives here.
 *
 * Same six-state vocabulary, colors, dot, 240ms state-change pulse and
 * aria-live wiring as the original — only the type register changes:
 * sentence-case labels, sans, text-micro, no tracking.
 */

import { motion } from "motion/react";

export type JarvisStatusState =
  | "ready"
  | "sending"
  | "thinking"
  | "streaming"
  | "error"
  | "undo";

interface JarvisStatusPillProps {
  state: JarvisStatusState;
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

const stateConfig: Record<JarvisStatusState, StateConfig> = {
  ready: {
    label: "Ready",
    dot: "var(--hud-cyan)",
    text: "var(--ink-muted)",
    border: "var(--edge-hud)",
    bg: "transparent",
  },
  sending: {
    label: "Sending",
    dot: "var(--hud-cyan-bright)",
    text: "var(--hud-cyan)",
    border: "var(--hud-cyan)",
    bg: "transparent",
  },
  thinking: {
    label: "Thinking",
    dot: "var(--ink-amber)",
    text: "var(--hud-cyan)",
    border: "var(--hud-cyan)",
    bg: "transparent",
  },
  streaming: {
    label: "Streaming",
    dot: "var(--hud-cyan-bright)",
    text: "var(--hud-cyan)",
    border: "var(--hud-cyan)",
    bg: "var(--hud-cyan-glow)",
  },
  error: {
    label: "Error",
    dot: "var(--ink-coral)",
    text: "var(--ink-coral)",
    border: "var(--ink-coral)",
    bg: "transparent",
  },
  undo: {
    label: "Undo",
    dot: "var(--ink-amber)",
    text: "var(--ink-amber)",
    border: "var(--edge-hud)",
    bg: "transparent",
  },
};

export function JarvisStatusPill({
  state,
  undoSecondsRemaining,
  className = "",
}: JarvisStatusPillProps) {
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
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-micro font-medium tabular-nums transition-colors duration-200 ease-out ${className}`}
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
