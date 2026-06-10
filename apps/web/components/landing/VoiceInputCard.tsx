"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Mic } from "lucide-react";

/**
 * VoiceInputCard — sibling to HeroJarvisLine. Mirrors the typed
 * demo card visually, but represents the spoken-input modality:
 *   - mic-prefixed input line
 *   - "Hey JARVIS, …" sample utterance
 *   - matching receipt
 *   - waveform-style listening indicator pulsing under the mic
 *
 * Cycles through 3 voice examples on the same cadence as
 * HeroJarvisLine so the two cards feel choreographed.
 */

interface VoiceExample {
  utterance: string;
  verb: "scheduled" | "created" | "captured";
  body: string;
}

const VOICE_EXAMPLES: readonly VoiceExample[] = [
  {
    utterance: "Hey JARVIS — schedule a run tomorrow at 6am.",
    verb: "scheduled",
    body: 'gcal · tomorrow 6:00 AM · "Morning run"',
  },
  {
    utterance: "Hey JARVIS — remind me to call mom tonight.",
    verb: "created",
    body: "task · tonight · reminder",
  },
  {
    utterance: "Hey JARVIS — capture: polymathy as competitive edge.",
    verb: "captured",
    body: "capture · #idea",
  },
] as const;

const EASE_OUT_QUART: [number, number, number, number] = [0.25, 1, 0.5, 1];
const CYCLE_MS = 5800;

export function VoiceInputCard() {
  const reducedMotion = useReducedMotion();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (reducedMotion) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % VOICE_EXAMPLES.length),
      CYCLE_MS,
    );
    return () => clearInterval(t);
  }, [reducedMotion]);

  const example = VOICE_EXAMPLES[idx];

  return (
    <motion.div
      key={idx}
      className="inline-flex flex-col items-start gap-2 px-5 py-4 rounded bg-[var(--surface-raised)] w-full"
      style={{
        border: "1px solid var(--edge-hud)",
        boxShadow: "var(--glow-hud-subtle)",
      }}
      initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: EASE_OUT_QUART }}
    >
      {/* Mode badge */}
      <div className="flex items-center justify-between w-full pb-1 mb-1 border-b border-[var(--edge-hud)] opacity-80">
        <div
          className="inline-flex items-center gap-1.5 font-mono text-[14px] font-medium uppercase tracking-[0.14em]"
          style={{ color: "var(--hud-cyan-light)" }}
        >
          <Mic size={12} aria-hidden="true" strokeWidth={2} />
          <span>Spoken</span>
        </div>
        <span
          className="font-mono text-[14px] tracking-[0.14em] opacity-60"
          style={{ color: "var(--ink-muted)" }}
        >
          JARVIS
        </span>
      </div>

      {/* Utterance line */}
      <div className="font-mono font-mono-stats text-[14px] leading-[1.55] text-[var(--ink)] whitespace-pre-wrap break-words text-left w-full flex items-start gap-2">
        <span
          aria-hidden="true"
          className="inline-flex items-end gap-[2px] mt-[3px]"
        >
          {[0, 1, 2, 3].map((b) => (
            <motion.span
              key={b}
              className="block w-[2px] rounded-full"
              style={{ background: "var(--hud-cyan)" }}
              animate={
                reducedMotion
                  ? { height: 6 }
                  : {
                      height: [4, 10, 6, 12, 4][
                        (b + idx) % 5
                      ],
                    }
              }
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : {
                      duration: 0.9 + b * 0.07,
                      repeat: Infinity,
                      repeatType: "reverse",
                      ease: "easeInOut",
                    }
              }
            />
          ))}
        </span>
        <span className="flex-1">{example.utterance}</span>
      </div>

      {/* Receipt */}
      <div className="font-mono font-mono-stats text-[14px] leading-[1.55] text-left w-full">
        <span style={{ color: "var(--hud-cyan)" }}>❦ </span>
        <span className="font-medium" style={{ color: "var(--hud-cyan)" }}>
          {example.verb}
        </span>
        <span className="text-[var(--ink-muted)]">  →  {example.body}</span>
      </div>
    </motion.div>
  );
}
