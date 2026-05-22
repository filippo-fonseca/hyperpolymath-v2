"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2, Radio, Volume2 } from "lucide-react";
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

  if (!mounted || !settings.voiceEnabled) return null;
  // Only show the pill when JARVIS is actually doing something — recording,
  // thinking, speaking, or the brief tentative window right after a wake
  // burst fires. In plain `listening` (or idle) the pill is hidden entirely
  // so the user has no false "I'm active" cue when they're not addressing
  // JARVIS.
  const fsmActive =
    state === "recording" || state === "thinking" || state === "speaking";
  if (!fsmActive && !tentativelyActive) return null;

  const muted = settings.discreetMode;
  const isThinking = state === "thinking";
  const isRecording = state === "recording";
  const isSpeaking = state === "speaking";
  const isBursting = burstAt > 0 && Date.now() - burstAt < 700;

  const label = muted
    ? "Muted"
    : isRecording
      ? "Recording"
      : isThinking
        ? "Thinking…"
        : isSpeaking
          ? "Speaking"
          : "Listening";

  const Icon = muted
    ? MicOff
    : isRecording
      ? Radio
      : isThinking
        ? Loader2
        : isSpeaking
          ? Volume2
          : Mic;

  return (
    <div
      aria-live="polite"
      aria-label={`JARVIS ${label}`}
      className={cn(
        "fixed bottom-4 right-4 z-50 pointer-events-none",
        "select-none",
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
          "font-mono text-xs uppercase tracking-[0.08em]",
          "transition-colors duration-200 ease-out backdrop-blur",
          muted
            ? "bg-[var(--surface-raised)]/80 border-[var(--edge)] text-[var(--ink-muted)]"
            : isRecording || isThinking || isSpeaking
              ? "bg-[var(--surface-raised)]/95 border-[var(--hud-cyan)] text-[var(--hud-cyan)]"
              : "bg-[var(--surface-raised)]/80 border-[var(--edge-hud)] text-[var(--ink-muted)]",
        )}
        style={{
          boxShadow:
            !muted && (isRecording || isThinking || isSpeaking)
              ? "0 0 12px color-mix(in oklch, var(--hud-cyan) 35%, transparent)"
              : undefined,
        }}
      >
        <Icon
          size={14}
          strokeWidth={1.75}
          className={cn(
            isThinking ? "animate-spin" : "",
            !muted && (isRecording || isSpeaking) ? "jarvis-pulse" : "",
          )}
        />
        <span>{label}</span>
      </div>
    </div>
  );
}
