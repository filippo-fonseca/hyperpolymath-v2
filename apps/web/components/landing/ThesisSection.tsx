"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { HeroJarvisLine } from "./HeroJarvisLine";
import { HudCoreBubble } from "@/components/shared/HudCoreBubble";

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
 * Container: max-w-[920px] mx-auto, vertically centered in first 90vh.
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
      <div className="max-w-[920px] mx-auto text-center">
        {/* Hero JARVIS centerpiece — the same HudCoreBubble visual that
            appears in the JARVIS Console when the user talks to the agent.
            Concentric instrument rings, rotating outer scale, arc-tip
            sweep, breathing inner glow, central Stark-signature triangle.
            Idle but visibly alive; reduced-motion freezes the rotations.
            Pulled into the landing as the frontispiece so the visitor sees
            the actual agent visual before any prose explains it. */}
        <div className="mx-auto flex items-center justify-center select-none -mt-8 mb-2">
          <HudCoreBubble state="thinking" />
        </div>

        <motion.div className="mt-8" {...enter}>
          <p className="font-serif italic text-[18px] leading-[1.5] text-[var(--ink-muted)]">
            &ldquo;When we can&rsquo;t take ownership of the situation, we
            can still take ownership of the process.&rdquo;
          </p>
          <p className="mt-2 font-serif italic text-[18px] leading-[1.5] text-[var(--ink-muted)]">
            &ldquo;Play holds the key to true productivity.&rdquo;
          </p>
          <p className="mt-2 font-mono text-[14px] text-[var(--ink-muted)] tracking-[0.04em]">
            — Ali Abdaal
          </p>
        </motion.div>

        <motion.h1
          id="thesis-headline"
          className="mt-10 font-serif font-semibold text-[44px] leading-[1.1] text-[var(--ink)] whitespace-nowrap"
          initial={enter.initial}
          animate={enter.animate}
          transition={
            reducedMotion
              ? undefined
              : { duration: 0.8, delay: 0.1, ease: EASE_OUT_QUART }
          }
        >
          I brought back the Renaissance. And JARVIS.
        </motion.h1>

        {/* Impactful subheader — Display 2 (32px), between the 56px hero
            and the 18px paragraph in the typographic hierarchy. */}
        <motion.p
          className="mt-6 font-serif font-semibold text-[32px] leading-[1.2] text-[var(--ink)] max-w-[780px] mx-auto"
          initial={enter.initial}
          animate={enter.animate}
          transition={
            reducedMotion
              ? undefined
              : { duration: 0.75, delay: 0.22, ease: EASE_OUT_QUART }
          }
        >
          A personal life-OS for people who refuse to specialize.
        </motion.p>

        <motion.p
          className="mt-5 font-serif italic text-[18px] leading-[1.5] text-[var(--ink-muted)] max-w-[620px] mx-auto"
          initial={enter.initial}
          animate={enter.animate}
          transition={
            reducedMotion
              ? undefined
              : { duration: 0.7, delay: 0.36, ease: EASE_OUT_QUART }
          }
        >
          Type or speak one sentence to JARVIS, and the right action lands
          in the right place.
        </motion.p>

        {/* Live JARVIS line — auto-cycling typing+receipt loop. The
            centerpiece of the hero. */}
        <motion.div
          initial={enter.initial}
          animate={enter.animate}
          transition={
            reducedMotion
              ? undefined
              : { duration: 0.7, delay: 0.5, ease: EASE_OUT_QUART }
          }
        >
          <HeroJarvisLine />
        </motion.div>
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
