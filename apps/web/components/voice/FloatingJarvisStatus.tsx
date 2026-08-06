"use client";

import { useEffect, useRef, useState } from "react";
import { MicOff } from "lucide-react";
import { KiwiIcon } from "@/components/shared/KiwiIcon";
import { useVoiceSettings } from "@/lib/voice/use-voice-settings";
import { subscribeToMicState } from "@/lib/voice/mic-state-bus";
import type { MicState } from "@/lib/voice/types";
import { cn } from "@/lib/utils";

/**
 * FloatingJarvisStatus — always-visible HUD pill in the bottom-right of any
 * (app) page. Subscribes to mic-state-bus and reflects the listener's FSM
 * so the user has feedback no matter what page they're on.
 *
 * Wake-word burst: when the FSM transitions listening → recording or
 * listening → thinking (the wake-word activation paths), a one-shot pulse
 * animation runs to "truly stand out" per the spec — bright cyan glow ring
 * expands and contracts over ~600ms, drawing the eye.
 *
 * Hidden when voiceEnabled=false (no chrome when feature is off).
 *
 * Tap to (future) open a mini-console panel; for now non-interactive.
 */
export function FloatingJarvisStatus() {
  const { settings, mounted } = useVoiceSettings();
  const [state, setState] = useState<MicState>("idle");
  const [burstAt, setBurstAt] = useState<number>(0);
  const [tentativelyActive, setTentativelyActive] = useState(false);
  const tentativeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeToMicState(setState), []);

  // Listen for the unified wake-burst event — fires the moment JARVIS sees
  // the user addressing it (VAD speech start in listening, or PRESS_TO_TALK).
  // Wake-word and press-to-talk paths feel identical.
  useEffect(() => {
    function handleWakeBurst() {
      const now = Date.now();
      setBurstAt(now);
      setTentativelyActive(true);
      // Clear the halo element after the keyframe finishes, then clear the
      // tentative-active state a few seconds later (covers wake-word STT
      // latency before the FSM moves out of listening).
      setTimeout(() => setBurstAt((current) => (current === now ? 0 : current)), 800);
      if (tentativeTimerRef.current) clearTimeout(tentativeTimerRef.current);
      tentativeTimerRef.current = setTimeout(() => {
        setTentativelyActive(false);
        tentativeTimerRef.current = null;
      }, 4000);
    }
    window.addEventListener("jarvis-wake-burst", handleWakeBurst);
    return () => {
      window.removeEventListener("jarvis-wake-burst", handleWakeBurst);
      if (tentativeTimerRef.current) clearTimeout(tentativeTimerRef.current);
    };
  }, []);

  // Only show the pill when JARVIS is actually doing something — recording,
  // thinking, speaking, or the brief tentative window right after a wake
  // burst fires. In plain `listening` (or idle) the pill is hidden entirely
  // so the user has no false "I'm active" cue when they're not addressing
  // JARVIS.
  const fsmActive =
    state === "recording" || state === "thinking" || state === "speaking";
  const shouldShow =
    mounted && settings.voiceEnabled && (fsmActive || tentativelyActive);

  // Enter/exit machine: keep the pill mounted through a short exit fade so it
  // slides away gracefully instead of vanishing on the frame it goes idle.
  const [render, setRender] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (shouldShow) {
      setRender(true);
      setLeaving(false);
      return;
    }
    if (!render) return;
    setLeaving(true);
    const timer = setTimeout(() => {
      setRender(false);
      setLeaving(false);
    }, 160);
    return () => clearTimeout(timer);
  }, [shouldShow, render]);

  if (!render) return null;

  const muted = settings.discreetMode;
  const isThinking = state === "thinking";
  const isRecording = state === "recording";
  const isSpeaking = state === "speaking";
  const isBursting = burstAt > 0 && Date.now() - burstAt < 700;

  const active = !muted && (isRecording || isThinking || isSpeaking);
  const label = muted
    ? "Muted"
    : isRecording
      ? "Recording"
      : isThinking
        ? "Thinking…"
        : isSpeaking
          ? "Speaking"
          : "Listening";

  // Kiwi is the permanent brand glyph; state is expressed by a compact
  // secondary indicator to its right, never by replacing the bird.
  const indicator: "muted" | "thinking" | "wave" | "none" = muted
    ? "muted"
    : isThinking
      ? "thinking"
      : isRecording || isSpeaking
        ? "wave"
        : "none";

  return (
    <div
      aria-live="polite"
      aria-label={`JARVIS ${label}`}
      className={cn(
        "fixed bottom-4 right-4 z-50 pointer-events-none select-none",
        leaving ? "orb-sfx-pill-leave" : "orb-sfx-pill-enter",
      )}
    >
      {/* Wake-word burst ring — only renders briefly on activation */}
      {isBursting ? (
        <span
          key={burstAt}
          className="absolute inset-0 -m-3 rounded-full"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--hud-cyan) 50%, transparent) 0%, transparent 70%)",
            animation: "jarvis-wake-burst 700ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
          }}
        />
      ) : null}

      <div
        className={cn(
          "relative flex items-center gap-2 rounded-full border px-3 py-1.5",
          "text-xs",
          "transition-colors duration-200 ease-out",
          muted
            ? "bg-[var(--surface-raised)]/95 border-[var(--edge)] text-[var(--ink-muted)]"
            : active
              ? "bg-[var(--surface-raised)]/95 border-[var(--hud-cyan)] text-[var(--hud-cyan)]"
              : "bg-[var(--surface-raised)]/95 border-[var(--edge-hud)] text-[var(--ink-muted)]",
        )}
        style={{
          boxShadow: active
            ? "0 0 12px color-mix(in oklch, var(--hud-cyan) 35%, transparent)"
            : undefined,
        }}
      >
        {/* Brand mark — the tilt wrapper micro-rotates once on each state
            change (keyed by state); the inner node carries the recording/
            speaking pulse so the two transforms never fight over `animation`. */}
        <span key={state} className="orb-sfx-bird">
          <span
            className={cn(
              "inline-flex",
              !muted && (isRecording || isSpeaking) ? "jarvis-pulse" : "",
            )}
          >
            <KiwiIcon size={14} aria-hidden="true" />
          </span>
        </span>
        <span>{label}</span>
        <HudStateIndicator kind={indicator} />
      </div>
    </div>
  );
}

/**
 * Compact secondary state indicator that sits to the right of the label.
 * Reads state without stealing the bird's role: three bouncing dots while
 * thinking, a tiny three-bar equalizer while recording/speaking, a mic-off
 * glyph when muted, nothing when merely listening.
 */
function HudStateIndicator({
  kind,
}: {
  kind: "muted" | "thinking" | "wave" | "none";
}) {
  if (kind === "muted") {
    return <MicOff size={12} strokeWidth={1.75} aria-hidden />;
  }
  if (kind === "thinking") {
    return (
      <span className="flex items-center" style={{ gap: "3px" }} aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="orb-sfx-dot"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </span>
    );
  }
  if (kind === "wave") {
    return (
      <span
        className="flex items-end"
        style={{ gap: "2px", height: "12px" }}
        aria-hidden
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="orb-sfx-bar"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </span>
    );
  }
  return null;
}
