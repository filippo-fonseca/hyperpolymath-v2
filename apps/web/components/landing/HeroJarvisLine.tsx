"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Mic, Terminal } from "lucide-react";

/**
 * Auto-cycling JARVIS animation for the hero. One sentence types in,
 * pauses, the receipt fades in beneath it, holds, then the whole card
 * fades out and the next example takes over. Loops forever.
 *
 * Differs from JarvisDemo (§03) in that this one is:
 *   - Smaller, fits inside the 90vh hero
 *   - Auto-cycles (no "▶ show another" button)
 *   - Shows just one receipt per example (JarvisDemo is up to two)
 *   - Doesn't try to replicate the README example verbatim
 *
 * SSR behavior matches JarvisDemo: initial state is the first example
 * settled, so JS-disabled visitors see a finished frame, not a blank one.
 *
 * Reduced motion: stays in the settled SSR state, no caret, no cycling.
 *
 * Phase 8 Plan 08-06 gap closure — user asked for an "awesome JARVIS thing"
 * in the hero. This is it.
 */

type Mode = "type" | "voice";

type Example = {
  input: string;
  verb: string;
  body: string;
  mode: Mode;
};

// Typed-only examples — the spoken modality has its own dedicated
// VoiceInputCard sibling next to this one under the hero banner.
const EXAMPLES: readonly Example[] = [
  {
    input: "#idea polymathy as competitive edge",
    verb: "captured",
    body: "capture · #idea",
    mode: "type",
  },
  {
    input: "anth pset by fri 3pm $ANTH 2480",
    verb: "created",
    body: "task · fri 3:00 PM · P2 · linked $ANTH 2480",
    mode: "type",
  },
  {
    input: "coffee w/ sam 3pm friday",
    verb: "scheduled",
    body: 'gcal · fri 3:00 PM · "Coffee with Sam"',
    mode: "type",
  },
] as const;

const CHAR_INTERVAL_MS = 38;
const PUNCT_PAUSE_MS = 120;
const POST_TYPE_PAUSE_MS = 500;
const RECEIPT_HOLD_MS = 2600;
const FADE_OUT_MS = 380;
const HERO_ENTRANCE_DELAY_MS = 1500; // wait for hero fade-up to settle

const EASE_OUT_QUART: [number, number, number, number] = [0.25, 1, 0.5, 1];

type Phase = "settled" | "typing" | "receipt" | "fadeout";

export function HeroJarvisLine() {
  const reducedMotion = useReducedMotion();
  const [exampleIdx, setExampleIdx] = useState(0);
  // Initial state "settled" so SSR renders the first example as a finished
  // frame (matches JarvisDemo SSR pattern from UI-SPEC §11d).
  const [phase, setPhase] = useState<Phase>("settled");
  const [typedChars, setTypedChars] = useState(EXAMPLES[0].input.length);

  const example = EXAMPLES[exampleIdx];

  // On mount: if motion allowed, kick off the loop after the hero entrance.
  useEffect(() => {
    if (reducedMotion) return;
    const t = setTimeout(() => {
      setTypedChars(0);
      setPhase("typing");
    }, HERO_ENTRANCE_DELAY_MS);
    return () => clearTimeout(t);
  }, [reducedMotion]);

  // Typing loop
  useEffect(() => {
    if (reducedMotion || phase !== "typing") return;
    if (typedChars >= example.input.length) {
      const t = setTimeout(() => setPhase("receipt"), POST_TYPE_PAUSE_MS);
      return () => clearTimeout(t);
    }
    const nextChar = example.input[typedChars];
    const delay =
      nextChar === "." || nextChar === ","
        ? CHAR_INTERVAL_MS + PUNCT_PAUSE_MS
        : CHAR_INTERVAL_MS;
    const t = setTimeout(() => setTypedChars((c) => c + 1), delay);
    return () => clearTimeout(t);
  }, [phase, typedChars, example.input, reducedMotion]);

  // Receipt hold → fadeout
  useEffect(() => {
    if (reducedMotion || phase !== "receipt") return;
    const t = setTimeout(() => setPhase("fadeout"), RECEIPT_HOLD_MS);
    return () => clearTimeout(t);
  }, [phase, reducedMotion]);

  // Fadeout → next example, reset to typing
  useEffect(() => {
    if (reducedMotion || phase !== "fadeout") return;
    const t = setTimeout(() => {
      setExampleIdx((i) => (i + 1) % EXAMPLES.length);
      setTypedChars(0);
      setPhase("typing");
    }, FADE_OUT_MS + 60);
    return () => clearTimeout(t);
  }, [phase, reducedMotion]);

  const showCaret = !reducedMotion && phase === "typing";
  const showReceipt = phase === "receipt" || phase === "settled";
  const typedText =
    phase === "typing" ? example.input.slice(0, typedChars) : example.input;

  return (
    <div className="flex min-w-0 w-full justify-center" aria-live="polite">
      <motion.div
        key={exampleIdx}
        className="inline-flex w-full min-w-0 max-w-[560px] flex-col items-start gap-2 rounded bg-[var(--sd-box)] px-4 py-4 sm:px-5"
        style={{
          border: "1px solid color-mix(in oklch, var(--sd-accent) 30%, var(--sd-line))",
          boxShadow: "none",
        }}
        // SSR-safe: `initial` is identical on server and first client render
        // (both resolve { opacity: 0, ... }); only the transition is branched,
        // so reduced motion settles instantly (0ms) with no hydration mismatch.
        initial={{ opacity: 0, y: 8, scale: 0.985 }}
        animate={{
          opacity: phase === "fadeout" ? 0 : 1,
          y: 0,
          scale: 1,
        }}
        transition={{
          duration: reducedMotion ? 0 : phase === "fadeout" ? 0.38 : 0.55,
          ease: EASE_OUT_QUART,
        }}
      >
        {/* Mode badge — flips between TYPED ($ ) and SPOKEN (mic) so the
            hero advertises both input modalities. */}
        <div className="flex items-center justify-between w-full pb-1 mb-1 border-b border-[var(--sd-line)] opacity-80">
          <div
            className="inline-flex items-center gap-1.5 font-mono text-[14px] font-medium uppercase tracking-[0.14em]"
            style={{ color: "var(--sd-accent)" }}
          >
            {example.mode === "voice" ? (
              <>
                <Mic size={12} aria-hidden="true" strokeWidth={2} />
                <span>Spoken</span>
              </>
            ) : (
              <>
                <Terminal size={12} aria-hidden="true" strokeWidth={2} />
                <span>Typed</span>
              </>
            )}
          </div>
          <span
            className="font-mono text-[14px] tracking-[0.14em] opacity-60"
            style={{ color: "var(--sd-ink-faint)" }}
          >
            JARVIS
          </span>
        </div>

        {/* Input line — prefix flips between $ and a mic glyph */}
        <div className="font-mono font-mono-stats text-[14px] leading-[1.55] text-[var(--sd-ink)] whitespace-pre-wrap break-words text-left w-full">
          <span style={{ color: "var(--sd-accent)" }}>
            {example.mode === "voice" ? "🎙  " : "$ "}
          </span>
          <span>{typedText}</span>
          {showCaret && (
            <span
              className="hud-streaming-caret inline-block ml-[2px]"
              style={{ color: "var(--sd-accent)" }}
              aria-hidden="true"
            >
              ▮
            </span>
          )}
        </div>

        {/* Receipt line */}
        <AnimatePresence mode="wait">
          {showReceipt && (
            <motion.div
              key={`receipt-${exampleIdx}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.32, ease: EASE_OUT_QUART }}
              className="font-mono font-mono-stats text-[14px] leading-[1.55] text-left w-full"
            >
              <span style={{ color: "var(--sd-accent)" }}>⚜ </span>
              <span
                className="font-medium"
                style={{ color: "var(--sd-accent)" }}
              >
                {example.verb}
              </span>
              <span className="text-[var(--sd-ink-faint)]">  →  {example.body}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
