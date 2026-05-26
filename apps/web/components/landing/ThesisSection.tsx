"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { HeroJarvisLine } from "./HeroJarvisLine";
import { HudThinkingRing } from "@/components/shared/HudThinkingRing";

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
        {/* Hero JARVIS aura — the rotating HudThinkingRing wraps the ⚜
            ornament. The ring is the same "agent thinking" indicator the
            app uses while JARVIS waits on a token; using it here makes
            the hero a JARVIS surface, not just a manifesto headline.
            Reduced motion: ring freezes at 12 o'clock per HudThinkingRing's
            built-in handling; ornament holds a static opacity. */}
        <div className="mx-auto relative inline-flex items-center justify-center select-none">
          {/* Soft outer glow halo, sits behind the ring */}
          <div
            aria-hidden="true"
            className="absolute"
            style={{
              width: "180px",
              height: "180px",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, var(--hud-cyan-glow) 0%, transparent 65%)",
              filter: "blur(12px)",
              pointerEvents: "none",
            }}
          />
          <HudThinkingRing size={108} className="relative" />
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: reducedMotion ? 0.95 : 0.6 }}
            animate={
              reducedMotion
                ? { opacity: 0.95 }
                : { opacity: [0.7, 1, 0.7] }
            }
            transition={
              reducedMotion
                ? { duration: 0 }
                : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
            }
            style={{
              color: "var(--hud-cyan)",
              textShadow: "0 0 16px var(--hud-cyan-glow)",
              fontSize: "44px",
              lineHeight: 1,
            }}
          >
            ⚜
          </motion.span>
        </div>

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
