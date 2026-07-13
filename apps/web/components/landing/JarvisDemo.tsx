"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { SectionEyebrow } from "./SectionEyebrow";

/**
 * §02 — Live JARVIS Demo (LAND-DEMO / SC-3 / D-01-D-03 / UI-SPEC §5b + §7).
 *
 * The centerpiece of the landing. Replay of the README ASCII demo block via
 * a vanilla useState+setTimeout FSM (UI-SPEC §7b explicitly forbids motion's
 * <Typewriter> — the choreography exceeds the declarative model).
 *
 * Cyan placement (one of 2 surfaces allowed cyan per UI-SPEC §4):
 *   1. ⚜ ornament glyph on each receipt line
 *   2. Verb on each receipt line ("scheduled", "created", "captured")
 *   3. Streaming caret ▮ during typing (uses .hud-streaming-caret class)
 *
 * SSR / JS-disabled (RESEARCH Pitfall 7 / SC-9):
 *   - Initial state is "settled" so server renders Example A complete (input + 2 receipts)
 *   - On mount, if !reducedMotion, state resets to "typing" and animation begins
 *   - JS-off visitors see a "terminal already finished" snapshot — usable
 *
 * Reduced motion (UI-SPEC §11d / D-02):
 *   - useReducedMotion() short-circuits useEffects → state stays "settled"
 *   - Caret never renders, receipts have initial={false} (no fade)
 */

type DemoState =
  | { phase: "typing"; typedChars: number }
  | { phase: "pause" }
  | { phase: "submitted" }
  | { phase: "settled" };

type Example = {
  input: string;
  receipts: Array<{ verb: string; body: string }>;
};

// UI-SPEC §7c — the 3 rotating examples, verbatim.
const EXAMPLES: readonly Example[] = [
  {
    // Example A: multi-action (the canonical README example, ships as default)
    input: "coffee with brian 4pm saturday. send the brief friday afternoon",
    receipts: [
      { verb: "scheduled", body: 'gcal · sat 4:00pm · "Coffee with Brian"' },
      { verb: "created", body: 'task · fri afternoon · P2 · "Send the brief"' },
    ],
  },
  {
    // Example B: capture-only (shows capture-first principle)
    input: "#idea polymathy as a competitive advantage",
    receipts: [{ verb: "captured", body: "capture · #idea" }],
  },
  {
    // Example C: project-tagged task with implicit date
    input: "finish anth pset $ANTH 2480 p2 by 3pm tomorrow",
    receipts: [
      {
        verb: "created",
        body: "task · tomorrow 3:00pm · P2 · linked $ANTH 2480",
      },
    ],
  },
] as const;

// Timing constants — UI-SPEC §6 + §7b
const CHAR_INTERVAL_MS = 35; // ≈28 cps
const PUNCT_PAUSE_MS = 140; // extra on '.' or ','
const POST_TYPE_PAUSE_MS = 600; // pause between typing end and receipt fade

export function JarvisDemo() {
  const [exampleIdx, setExampleIdx] = useState(0);
  // Initial state "settled" so SSR renders the final frame (Pitfall 7).
  const [state, setState] = useState<DemoState>({ phase: "settled" });
  const reducedMotion = useReducedMotion();
  const example = EXAMPLES[exampleIdx];

  // On mount: if motion allowed, reset to typing and begin animation.
  // Reduced motion: stay in "settled" — SSR'd content remains visible.
  useEffect(() => {
    if (reducedMotion) {
      setState({ phase: "settled" });
      return;
    }
    setState({ phase: "typing", typedChars: 0 });
  }, [exampleIdx, reducedMotion]);

  // Typing loop
  useEffect(() => {
    if (reducedMotion || state.phase !== "typing") return;
    if (state.typedChars >= example.input.length) {
      const t = setTimeout(() => setState({ phase: "pause" }), 0);
      return () => clearTimeout(t);
    }
    const nextChar = example.input[state.typedChars];
    const delay =
      nextChar === "." || nextChar === ","
        ? CHAR_INTERVAL_MS + PUNCT_PAUSE_MS
        : CHAR_INTERVAL_MS;
    const t = setTimeout(() => {
      if (state.phase !== "typing") return;
      setState({ phase: "typing", typedChars: state.typedChars + 1 });
    }, delay);
    return () => clearTimeout(t);
  }, [state, example.input, reducedMotion]);

  // Pause → submitted
  useEffect(() => {
    if (reducedMotion) return;
    if (state.phase === "pause") {
      const t = setTimeout(
        () => setState({ phase: "submitted" }),
        POST_TYPE_PAUSE_MS,
      );
      return () => clearTimeout(t);
    }
  }, [state.phase, reducedMotion]);

  const showCaret = !reducedMotion && state.phase === "typing";
  const showReceipts =
    state.phase === "submitted" || state.phase === "settled";
  const typedText =
    state.phase === "typing"
      ? example.input.slice(0, state.typedChars)
      : example.input;

  function showAnother() {
    setExampleIdx((i) => (i + 1) % EXAMPLES.length);
  }

  return (
    <section className="py-16 max-w-[920px] mx-auto px-6 md:px-10">
      <SectionEyebrow label="§ 04 · DEMO" />
      <h2 className="mt-2 font-serif font-semibold text-[32px] leading-[1.2] text-[var(--ink)]">
        Watch it route.
      </h2>
      <p className="mt-4 font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
        One sentence in, one or more actions out, each routed to the right
        primitive. This is what I use every day to keep my own life in one
        place.
      </p>

      {/* The terminal block */}
      <div className="mt-6 border border-[var(--edge)] rounded bg-[var(--surface-raised)] p-6 overflow-x-auto custom-scrollbar">
        <div className="font-mono font-mono-stats text-[14px] leading-[1.55] text-[var(--ink)]">
          <div>
            <span className="text-[var(--ink-muted)]">$ </span>
            <span>{typedText}</span>
            {showCaret && (
              <span
                className="hud-streaming-caret inline-block ml-[2px]"
                style={{ color: "var(--hud-cyan)" }}
                aria-hidden="true"
              >
                ▮
              </span>
            )}
          </div>
          {showReceipts && (
            <AnimatePresence mode="popLayout">
              <div
                className="mt-4 space-y-2"
                key={`receipts-${exampleIdx}`}
              >
                {example.receipts.map((r, i) => (
                  <motion.div
                    key={`${exampleIdx}-${i}`}
                    // SSR-safe: identical `initial` on server + first client
                    // render; only the transition is branched, so reduced motion
                    // settles instantly (0ms) with no hydration mismatch.
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: reducedMotion ? 0 : 0.28,
                      delay: reducedMotion ? 0 : i * 0.22,
                      ease: [0.25, 1, 0.5, 1], // --ease-out-quart
                    }}
                  >
                    <span style={{ color: "var(--hud-cyan)" }}>⚜ </span>
                    <span
                      className="font-medium"
                      style={{ color: "var(--hud-cyan)" }}
                    >
                      {r.verb}
                    </span>
                    <span className="text-[var(--ink)]">  →  {r.body}</span>
                  </motion.div>
                ))}
              </div>
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* "▶ show another" — right-aligned below terminal */}
      <div className="mt-4 flex justify-end max-w-[920px] mx-auto">
        <button
          type="button"
          onClick={showAnother}
          className="font-mono text-[14px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)] opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
        >
          ▶ show another
        </button>
      </div>
    </section>
  );
}
