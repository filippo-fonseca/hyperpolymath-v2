"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";

/**
 * §01 — Thesis section (the cold open).
 *
 * Per UI-SPEC §5a:
 *   - NO mono eyebrow (the only section without one — opens cold like a frontispiece)
 *   - Pull-quote (top) — Body 18 italic, --ink-muted
 *   - 48px vertical gap
 *   - Thesis Display 1 — 56px serif 600, --ink, 3 lines, max 32 chars per line
 *   - 32px vertical gap
 *   - Sub-line — Body 18 serif italic, --ink-muted, single line
 *   - Below-fold: ↓ ChevronDown 16px, --ink-muted opacity 0.5, breathing 1.5s loop
 *     (opacity 0.3 → 0.7 → 0.3 per UI-SPEC §6)
 *   - Vanishes on first scroll (no nag)
 *   - Reduced-motion: static opacity 0.5, no breath; still vanishes on first scroll
 *
 * Container: max-w-[720px] mx-auto, vertically centered in first 90vh.
 *
 * Copy strings verbatim from UI-SPEC §9.
 *
 * Phase 8 Plan 08-03 — LAND-THESIS (SC-2 / UI-SPEC §5a).
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

  return (
    <section
      className="relative min-h-[90vh] flex flex-col items-center justify-center px-6 md:px-10"
      aria-labelledby="thesis-headline"
    >
      <div className="max-w-[720px] mx-auto text-center">
        <p className="font-serif italic text-[18px] leading-[1.5] text-[var(--ink-muted)]">
          &ldquo;You don&rsquo;t have to choose between being a runner or a
          musician, a creator or a scholar. The Renaissance had it right.&rdquo;
        </p>

        <h1
          id="thesis-headline"
          className="mt-12 font-serif font-semibold text-[56px] leading-[1.1] text-[var(--ink)]"
        >
          I brought back
          <br />
          the Renaissance.
        </h1>

        <p className="mt-8 font-serif italic text-[18px] leading-[1.5] text-[var(--ink-muted)]">
          A personal life-OS for people who refuse to specialize. Type one
          sentence &mdash; the right action lands in the right place.
        </p>

        <p className="mt-6 font-serif text-[18px] leading-[1.6] text-[var(--ink)] max-w-[560px] mx-auto">
          One brain holds five primitives &mdash; areas, projects, captures,
          calendar, and the agent that routes between them. The whole point is
          that you stop choosing.
        </p>
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
