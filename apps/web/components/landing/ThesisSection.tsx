"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";

// --ease-out-quart token, typed as a 4-tuple for Motion's cubic-bezier inference.
const EASE_OUT_QUART: [number, number, number, number] = [0.25, 1, 0.5, 1];

/**
 * §01 — Thesis section (the cold open).
 *
 * Phase 8 Plan 08-06 gap closure: hero now leads with a cyan ⚜ ornament
 * (the JARVIS signature) that breathes above the pull-quote. JARVIS is the
 * centerpiece of the system, so the cold open puts the agent's glyph on the
 * frontispiece. The hero h1 and surrounding paragraphs fade-up on mount for
 * a softer entrance. ↓ scroll affordance retained at bottom-12.
 *
 * Container: max-w-[800px] mx-auto, vertically centered in first 90vh.
 */
export function ThesisSection() {
  const reducedMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      if (window.scrollY > 8) setScrolled(true);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mount-time entrance (not scroll-triggered — respects §11d).
  const enter = reducedMotion
    ? { initial: false, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.7, ease: EASE_OUT_QUART },
      };

  return (
    <section
      className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 md:px-10"
      aria-labelledby="thesis-headline"
    >
      <div className="max-w-[800px] mx-auto text-center">
        {/* Cyan ⚜ frontispiece ornament — JARVIS centerpiece signature.
            Breathes gently; reduced-motion fixes opacity. */}
        <motion.div
          aria-hidden="true"
          className="mx-auto select-none"
          initial={{ opacity: reducedMotion ? 0.85 : 0.5 }}
          animate={
            reducedMotion
              ? { opacity: 0.85 }
              : { opacity: [0.55, 0.95, 0.55] }
          }
          transition={
            reducedMotion
              ? { duration: 0 }
              : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
          }
          style={{
            color: "var(--hud-cyan)",
            textShadow: "0 0 18px var(--hud-cyan-glow)",
            fontSize: "32px",
            lineHeight: 1,
          }}
        >
          ⚜
        </motion.div>

        <motion.p
          className="mt-8 font-serif italic text-[18px] leading-[1.5] text-[var(--ink-muted)]"
          {...enter}
        >
          &ldquo;You don&rsquo;t have to choose between being a runner or a
          musician, a creator or a scholar. The Renaissance had it right.&rdquo;
        </motion.p>

        <motion.h1
          id="thesis-headline"
          className="mt-12 font-serif font-semibold text-[56px] leading-[1.1] text-[var(--ink)]"
          initial={enter.initial}
          animate={enter.animate}
          transition={
            reducedMotion
              ? undefined
              : { duration: 0.8, delay: 0.1, ease: EASE_OUT_QUART }
          }
        >
          I brought back
          <br />
          the Renaissance.
        </motion.h1>

        <motion.p
          className="mt-8 font-serif italic text-[18px] leading-[1.5] text-[var(--ink-muted)]"
          initial={enter.initial}
          animate={enter.animate}
          transition={
            reducedMotion
              ? undefined
              : { duration: 0.7, delay: 0.25, ease: EASE_OUT_QUART }
          }
        >
          A personal life-OS for people who refuse to specialize. You type
          one sentence to JARVIS, and the right action lands in the right
          place.
        </motion.p>

        <motion.p
          className="mt-6 font-serif text-[18px] leading-[1.6] text-[var(--ink)] max-w-[620px] mx-auto"
          initial={enter.initial}
          animate={enter.animate}
          transition={
            reducedMotion
              ? undefined
              : { duration: 0.7, delay: 0.4, ease: EASE_OUT_QUART }
          }
        >
          One brain holds five primitives: areas, projects, captures, a
          calendar, and the agent that routes between them all. That&rsquo;s
          the whole system. The point is to stop choosing.
        </motion.p>
      </div>

      {/* ↓ scroll affordance — vanishes on first scroll, breathes per UI-SPEC §6 */}
      {!scrolled && (
        <motion.div
          className="absolute bottom-12"
          initial={{ opacity: reducedMotion ? 0.5 : 0.3 }}
          animate={
            reducedMotion ? { opacity: 0.5 } : { opacity: [0.3, 0.7, 0.3] }
          }
          transition={
            reducedMotion
              ? { duration: 0 }
              : {
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }
          }
          aria-hidden="true"
        >
          <ChevronDown size={16} className="text-[var(--ink-muted)]" />
        </motion.div>
      )}
    </section>
  );
}
