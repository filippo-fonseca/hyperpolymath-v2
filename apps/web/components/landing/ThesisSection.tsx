"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { HeroJarvisLine } from "./HeroJarvisLine";
import { VoiceInputCard } from "./VoiceInputCard";
import { HudCoreBubble } from "@/components/shared/HudCoreBubble";

// --ease-out-quart token, typed as a 4-tuple for Motion's cubic-bezier inference.
const EASE_OUT_QUART: [number, number, number, number] = [0.25, 1, 0.5, 1];

/**
 * §01 — Thesis section / cold open.
 *
 * The hero now wears the same banner dress as the README GitHub hero:
 * cream-paper card with a soft neumorphic shadow, mono crest row up
 * top, an EB Garamond wordmark, italic tagline, a hairline + fleuron
 * spacer, and a centered brand statement with italic+extra-bold on
 * "Renaissance Human" and "JARVIS". The HudCoreBubble (the animated
 * cyan kiwi-in-aura — the actual JARVIS visual) keeps its place as
 * the focal point above the wordmark.
 *
 * Live demo line (HeroJarvisLine) + the Abdaal pull-quote sit BELOW
 * the banner card as separate beats. The Learn-more chevron stays
 * pinned to the bottom of the section.
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

  const enter = reducedMotion
    ? { initial: false, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.7, ease: EASE_OUT_QUART },
      };

  return (
    <section
      className="relative min-h-[100vh] flex flex-col items-center justify-center px-6 md:px-10 py-10 md:py-12"
      aria-labelledby="thesis-headline"
    >
      <div className="w-full max-w-[1080px] mx-auto">
        {/* ── Banner card — mirrors the README GitHub hero ── */}
        <motion.div
          {...enter}
          className="relative overflow-hidden rounded-[24px]"
          style={{
            // Theme-aware banner dress: --surface-raised/--surface are the warm
            // parchment tones in light mode and dark panel tones in dark mode,
            // so the card tracks the theme instead of staying cream while the
            // --ink text flips to near-white (the old dark-mode breakage).
            background:
              "linear-gradient(180deg, color-mix(in oklch, var(--surface-raised) 96%, transparent), color-mix(in oklch, var(--surface) 96%, transparent))",
            // Glass shadow tokens already invert between light/dark in globals.css.
            boxShadow: "inset 0 1px 0 var(--glass-hi), var(--glass-drop)",
            color: "var(--ink)",
          }}
        >
          {/* Hairline inner stroke — --edge tracks theme (dark stroke on a
              light card, subtle light stroke on a dark card). */}
          <div
            className="absolute inset-[0.5px] rounded-[23.5px] pointer-events-none"
            style={{
              border: "1px solid color-mix(in oklch, var(--edge) 80%, transparent)",
            }}
          />

          <div className="relative px-8 md:px-12 pt-5 md:pt-6 pb-5 md:pb-6">
            {/* Crest row — left meta and right meta in mono uppercase */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex gap-1.5 opacity-50"
                  aria-hidden="true"
                >
                  <span className="block w-[5px] h-[5px] rounded-full bg-[var(--ink)]" />
                  <span className="block w-[5px] h-[5px] rounded-full bg-[var(--ink)]" />
                  <span className="block w-[5px] h-[5px] rounded-full bg-[var(--ink)]" />
                </span>
                <span className="font-mono text-[10px] md:text-[11px] tracking-[0.22em] uppercase text-[var(--ink)] opacity-60">
                  My life operating system framework, open sourced  ·  v2
                </span>
              </div>
              <span className="font-mono text-[10px] md:text-[11px] tracking-[0.22em] uppercase text-[var(--ink)] opacity-60">
                MIT  ·  Open source
              </span>
            </div>

            {/* HudCoreBubble — animated cyan kiwi-in-aura. Visually scaled
                down so the whole banner fits the viewport without
                scrolling; the bubble's intrinsic SVG is 280px. */}
            <div
              className="mt-2 md:mt-3 mx-auto flex items-center justify-center select-none"
              style={{ height: 168 }}
            >
              <div style={{ transform: "scale(0.6)", transformOrigin: "center" }}>
                <HudCoreBubble state="thinking" />
              </div>
            </div>

            {/* Wordmark — EB Garamond */}
            <h1
              id="thesis-headline"
              className="mt-2 md:mt-3 font-serif font-semibold text-center text-[52px] md:text-[72px] leading-[1] tracking-[-0.02em] text-[var(--ink)]"
            >
              Hyperpolymath
            </h1>

            {/* Primary italic tagline */}
            <p className="mt-3 font-serif italic text-center text-[16px] md:text-[19px] leading-[1.4] text-[var(--ink)] opacity-75">
              A personal life-OS for people who refuse to specialize.
            </p>

            {/* Hairline + fleuron spacer */}
            <div
              className="mt-5 md:mt-6 flex items-center justify-center gap-4"
              aria-hidden="true"
            >
              <span className="h-px w-14 md:w-20 bg-[var(--ink)] opacity-15" />
              <span className="font-mono text-[11px] tracking-[0.3em] opacity-45">
                ❦
              </span>
              <span className="h-px w-14 md:w-20 bg-[var(--ink)] opacity-15" />
            </div>

            {/* Centered brand statement — single line on desktop. The
                size is constrained so the full sentence fits without
                wrapping at the card's max width. */}
            <p className="mt-5 md:mt-6 font-serif font-semibold text-center text-[18px] md:text-[22px] leading-[1.35] text-[var(--ink)] max-w-[1000px] mx-auto whitespace-normal md:whitespace-nowrap">
              I brought back the{" "}
              <em className="font-extrabold italic">Renaissance Human</em>
              . And gave them{" "}
              <em className="font-extrabold italic">JARVIS</em> from Tony Stark.{" "}
              <span className="italic">All in one.</span>
            </p>

            {/* Footer brand spine */}
            <div className="mt-5 md:mt-6 flex items-center justify-between border-t border-[var(--ink)]/10 pt-3 md:pt-4">
              <span className="font-mono text-[10px] md:text-[11px] tracking-[0.22em] uppercase text-[var(--ink)] opacity-55">
                ❦  Hyperpolymath  ·  by Filippo Fonseca
              </span>
              <span className="font-mono text-[10px] md:text-[11px] tracking-[0.22em] uppercase text-[var(--ink)] opacity-55">
                How you do one thing is how you do everything
              </span>
            </div>
          </div>
        </motion.div>

        {/* Typed + Spoken input cards sit side-by-side under the banner
            so visitors see both modalities advertised at once. */}
        <motion.div
          className="mt-6 md:mt-8 grid grid-cols-1 md:grid-cols-2 gap-4"
          initial={enter.initial}
          animate={enter.animate}
          transition={
            reducedMotion
              ? undefined
              : { duration: 0.7, delay: 0.45, ease: EASE_OUT_QUART }
          }
        >
          <HeroJarvisLine />
          <VoiceInputCard />
        </motion.div>
      </div>

      {/* Learn more */}
      {!scrolled && (
        <motion.button
          type="button"
          onClick={() => {
            const target = document.getElementById("why");
            if (!target) return;
            target.scrollIntoView({
              behavior: reducedMotion ? "auto" : "smooth",
              block: "start",
            });
          }}
          className="absolute bottom-10 inline-flex flex-col items-center gap-1 px-3 py-2 rounded text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
          initial={{ opacity: reducedMotion ? 0.7 : 0.5 }}
          animate={
            reducedMotion ? { opacity: 0.7 } : { opacity: [0.45, 0.85, 0.45] }
          }
          transition={
            reducedMotion
              ? { duration: 0 }
              : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
          }
          aria-label="Learn more · scroll to bio"
        >
          <span className="font-mono text-[14px] font-medium uppercase tracking-[0.14em]">
            Learn more
          </span>
          <ChevronDown size={18} aria-hidden="true" />
        </motion.button>
      )}
    </section>
  );
}
