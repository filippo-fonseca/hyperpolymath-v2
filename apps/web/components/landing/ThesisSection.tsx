"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { ChevronDown, ArrowUpRight, Github } from "lucide-react";
import { HeroJarvisLine } from "./HeroJarvisLine";
import { VoiceInputCard } from "./VoiceInputCard";
import { AmbientGlow, FocalOrb } from "@/components/ui/ambient";
import { Logotype } from "@/components/ui/Logotype";

// --ease-out-quart token, typed as a 4-tuple for Motion's cubic-bezier
// inference. An ease-OUT curve — the seed's sanctioned hero entrance.
const EASE_OUT_QUART: [number, number, number, number] = [0.25, 1, 0.5, 1];

/**
 * §01 — Thesis section / cold open, restyled onto the campaign register.
 *
 * This is the shop window: the spacedrive.com hero composition rendered in
 * the Renaissance voice. A near-black "printed plate" (dark in BOTH app
 * themes — the seed-sanctioned editorial choice, scoped via `.dark` so the
 * demo cards + inks resolve dark tokens without touching their internals),
 * a bold AmbientGlow + film-grain noise field, ONE glossy FocalOrb (the
 * canonical `components/ui/ambient` sphere), an EB Garamond headline that
 * punches out of the glow via a heavy black drop-shadow, a dull lede, and
 * pill CTAs.
 *
 * Every copy string from the prior banner-card hero is preserved. Motion is
 * the sanctioned hero fade-up (500ms ease-out, 100ms stagger); `useReduced-
 * Motion` freezes all of it and the plate stays fully legible.
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

  // Sanctioned hero entrance: opacity 0→1, y 12→0, 500ms ease-out, 100ms
  // stagger by index. The rendered `initial` is identical on server and
  // client (SSR can't read the motion preference), so only the transition
  // is branched — reduced motion resolves the same values in 0ms with no
  // travel, and there is no hydration mismatch.
  const fade = (i: number) => ({
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: reducedMotion
      ? { duration: 0 }
      : { duration: 0.5, ease: EASE_OUT_QUART, delay: i * 0.1 },
  });

  return (
    <section
      className="dark relative isolate flex min-h-[100svh] w-full max-w-[100vw] flex-col items-center justify-center overflow-hidden px-5 py-20 sm:px-6 sm:py-24 md:px-10 md:py-28"
      aria-labelledby="thesis-headline"
      style={
        {
          // Near-black blue-tinted field (constitution §C, #0b0d12 register).
          background:
            "radial-gradient(120% 80% at 50% 22%, #0d1017 0%, #08090d 55%, #060709 100%)",
          color: "var(--ink)",
          // Force the theatrical accent to the bright, theme-invariant cyan so
          // the glow + primary CTA read identically in both app themes on the
          // hard dark plate.
          "--sd-accent": "var(--hud-cyan)",
        } as CSSProperties
      }
    >
      <style>{HERO_AURORA_CSS}</style>

      {/* Plate edges: a whisper cyan hairline up top and a soft vignette that
          eases the dark field into the body below (graceful transition). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in oklch, var(--hud-cyan) 22%, transparent), transparent)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
        style={{
          background: "linear-gradient(180deg, transparent, rgba(4,5,7,0.9))",
        }}
      />

      {/* Theatrical ambient field — canonical bold glow pills + de-band noise,
          hero-anchored, drifting unless reduced-motion. Scoped to the plate
          (absolute inset-0) so it fills the section behind the content rather
          than the fixed full-viewport default. */}
      <AmbientGlow intensity="bold" anchor="hero" className="absolute inset-0 z-0" />

      {/* Hero aurora — slow sweeping light sheets behind the orb so the plate
          itself feels alive (not only the AmbientGlow blobs). */}
      <div className="landing-hero-aurora" aria-hidden="true">
        <span className="landing-hero-aurora__sheet landing-hero-aurora__sheet--a" />
        <span className="landing-hero-aurora__sheet landing-hero-aurora__sheet--b" />
        <span className="landing-hero-aurora__sheet landing-hero-aurora__sheet--c" />
        <span className="landing-hero-aurora__ring" />
      </div>

      <div className="relative z-10 mx-auto flex w-full min-w-0 max-w-[1080px] flex-col items-center text-center">
        {/* Crest row — mono brand meta, preserved verbatim. */}
        <motion.div
          {...fade(0)}
          className="flex w-full min-w-0 flex-col items-center justify-between gap-2 px-1 sm:flex-row sm:gap-4"
        >
          <div className="flex min-w-0 max-w-full items-center justify-center gap-2.5 sm:gap-3">
            <span className="inline-flex shrink-0 gap-1.5 opacity-50" aria-hidden="true">
              <span className="block h-[5px] w-[5px] rounded-full bg-[var(--ink)]" />
              <span className="block h-[5px] w-[5px] rounded-full bg-[var(--ink)]" />
              <span className="block h-[5px] w-[5px] rounded-full bg-[var(--ink)]" />
            </span>
            <span className="min-w-0 text-balance font-mono text-[10px] uppercase leading-snug tracking-[0.16em] text-[var(--ink-muted)] sm:tracking-[0.2em] md:text-[11px] md:tracking-[0.22em]">
              My life operating system framework, open sourced  ·  v2
            </span>
          </div>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-muted)] sm:tracking-[0.2em] md:text-[11px] md:tracking-[0.22em]">
            MIT  ·  Open source
          </span>
        </motion.div>

        {/* ONE glossy focal orb — bold bounce + scale + pulsing glow. Mount
            box leaves room for travel so overflow-hidden on the plate does
            not clip the motion. */}
        <motion.div
          {...fade(1)}
          className="mt-5 flex h-[210px] w-[210px] items-center justify-center sm:mt-6 md:mt-8 md:h-[260px] md:w-[260px]"
        >
          <div className="origin-center scale-[0.82] md:scale-100">
            <FocalOrb size={176} intensity="bold" />
          </div>
        </motion.div>

        {/* Headline — Logotype (EB Garamond), fluid so the full wordmark fits
            every phone width without clipping. Sized from available viewport
            minus section padding; capped at the desktop editorial 92px. */}
        <motion.h1
          {...fade(2)}
          id="thesis-headline"
          className="mt-5 w-full min-w-0 max-w-full sm:mt-6"
          style={{ filter: "drop-shadow(rgba(0,0,0,0.95) 0 16px 50px)" }}
        >
          <Logotype className="mx-auto block max-w-full whitespace-nowrap text-[clamp(2rem,calc((100vw-2.5rem)/8),5.75rem)] font-semibold leading-[0.98] tracking-[-0.02em] text-white" />
        </motion.h1>

        {/* Lede — dull ink, the reference site's muted sub-headline. */}
        <motion.p
          {...fade(3)}
          className="mt-4 max-w-[640px] px-1 font-serif text-[17px] leading-[1.45] text-balance text-[var(--ink-muted)] sm:mt-5 sm:text-[18px] md:text-[21px]"
        >
          A personal life-OS for people who refuse to specialize.
        </motion.p>

        {/* Brand statement — the Renaissance/JARVIS thesis, preserved. */}
        <motion.p
          {...fade(4)}
          className="mt-4 max-w-[760px] px-1 font-serif text-[16px] font-semibold leading-[1.4] text-balance text-[var(--ink)] sm:mt-5 sm:text-[17px] md:text-[20px]"
        >
          I brought back the{" "}
          <em className="font-extrabold italic">Renaissance Human</em>. And gave
          them <em className="font-extrabold italic">JARVIS</em> from Tony Stark.{" "}
          <span className="italic text-[var(--ink-muted)]">All in one.</span>
        </motion.p>

        {/* Pill CTAs — lit-from-above primary + glass ghost (constitution §C,
            §6). Labels: xs semibold uppercase tracking-[0.12em]. */}
        <motion.div
          {...fade(5)}
          className="mt-8 flex w-full max-w-md flex-col items-stretch gap-3 px-1 sm:mt-9 sm:max-w-none sm:flex-row sm:items-center sm:justify-center"
        >
          <Link
            href="/sign-in"
            className="sd-btn-primary group inline-flex items-center justify-center gap-2 px-6 py-3 text-xs font-semibold uppercase tracking-[0.12em] transition-transform duration-150 ease-out active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hud-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090d]"
          >
            <span>Get started</span>
            <ArrowUpRight
              size={14}
              strokeWidth={2.2}
              aria-hidden="true"
              className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
          <a
            href="https://github.com/filippo-fonseca/hyperpolymath-v2"
            target="_blank"
            rel="noopener noreferrer"
            className="sd-btn-ghost group inline-flex items-center justify-center gap-2 px-6 py-3 text-xs font-semibold uppercase tracking-[0.12em] transition-colors duration-150 hover:bg-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hud-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08090d]"
          >
            <Github size={14} strokeWidth={2} aria-hidden="true" />
            <span>View the source</span>
          </a>
        </motion.div>

        {/* Typed + Spoken input cards — both modalities advertised at once.
            They resolve dark tokens under the .dark plate scope, so they read
            exactly as they do in dark mode regardless of the app theme. */}
        <motion.div
          {...fade(6)}
          className="mt-10 grid w-full min-w-0 grid-cols-1 gap-4 sm:mt-12 md:grid-cols-2"
        >
          <HeroJarvisLine />
          <VoiceInputCard />
        </motion.div>

        {/* Brand spine — preserved mono meta, quiet under the fold of content. */}
        <motion.div
          {...fade(7)}
          className="mt-8 flex w-full min-w-0 flex-col items-center justify-between gap-2 border-t border-white/10 px-1 pt-5 sm:mt-10 sm:flex-row sm:gap-4"
        >
          <span className="text-center font-mono text-[10px] uppercase leading-snug tracking-[0.14em] text-[var(--ink-muted)] sm:tracking-[0.18em] md:text-[11px] md:tracking-[0.22em]">
            ❦  Hyperpolymath  ·  by Filippo Fonseca
          </span>
          <span className="text-center font-mono text-[10px] uppercase leading-snug tracking-[0.14em] text-[var(--ink-muted)] sm:tracking-[0.18em] md:text-[11px] md:tracking-[0.22em]">
            How you do one thing is how you do everything
          </span>
        </motion.div>
      </div>

      {/* Learn more — pinned scroll affordance, unchanged behavior. */}
      {!scrolled && (
        <motion.button
          type="button"
          onClick={() => {
            const target = document.getElementById("bio");
            if (!target) return;
            target.scrollIntoView({
              behavior: reducedMotion ? "auto" : "smooth",
              block: "start",
            });
          }}
          className="absolute bottom-8 z-10 inline-flex cursor-pointer flex-col items-center gap-1 rounded px-3 py-2 text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hud-cyan)]"
          initial={{ opacity: 0.5 }}
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

/** Slow aurora sheets + a breathing ring behind the hero orb. Pure CSS so it
 *  stays compositor-cheap and respects prefers-reduced-motion. */
const HERO_AURORA_CSS = `
.landing-hero-aurora {
  pointer-events: none;
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
}
.landing-hero-aurora__sheet {
  position: absolute;
  border-radius: 9999px;
  filter: blur(60px);
  will-change: transform, opacity;
  mix-blend-mode: screen;
}
.landing-hero-aurora__sheet--a {
  left: 50%;
  top: 18%;
  width: min(92vw, 720px);
  height: min(52vh, 420px);
  margin-left: calc(min(92vw, 720px) / -2);
  margin-top: calc(min(52vh, 420px) / -2);
  background: radial-gradient(ellipse at 50% 50%,
    rgb(var(--hud-cyan-rgb) / 0.22) 0%,
    rgb(var(--hud-cyan-rgb) / 0.06) 45%,
    transparent 72%);
  animation: landingAuroraA 11s ease-in-out infinite;
}
.landing-hero-aurora__sheet--b {
  left: 28%;
  top: 32%;
  width: min(55vw, 380px);
  height: min(40vh, 300px);
  margin-left: calc(min(55vw, 380px) / -2);
  margin-top: calc(min(40vh, 300px) / -2);
  background: radial-gradient(circle at 50% 50%,
    rgb(var(--hud-cyan-rgb) / 0.18) 0%,
    transparent 70%);
  animation: landingAuroraB 8.5s ease-in-out infinite;
}
.landing-hero-aurora__sheet--c {
  left: 72%;
  top: 24%;
  width: min(48vw, 340px);
  height: min(36vh, 280px);
  margin-left: calc(min(48vw, 340px) / -2);
  margin-top: calc(min(36vh, 280px) / -2);
  background: radial-gradient(circle at 50% 50%,
    rgb(var(--hud-cyan-rgb) / 0.14) 0%,
    transparent 68%);
  animation: landingAuroraC 9.5s ease-in-out infinite;
}
.landing-hero-aurora__ring {
  position: absolute;
  left: 50%;
  top: 34%;
  width: min(70vw, 420px);
  height: min(70vw, 420px);
  margin-left: calc(min(70vw, 420px) / -2);
  margin-top: calc(min(70vw, 420px) / -2);
  border-radius: 9999px;
  border: 1px solid rgb(var(--hud-cyan-rgb) / 0.14);
  box-shadow:
    0 0 40px rgb(var(--hud-cyan-rgb) / 0.12),
    inset 0 0 40px rgb(var(--hud-cyan-rgb) / 0.08);
  animation: landingAuroraRing 6s ease-in-out infinite;
}
@keyframes landingAuroraA {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.7; }
  50% { transform: translate3d(0, 4%, 0) scale(1.12); opacity: 1; }
}
@keyframes landingAuroraB {
  0%, 100% { transform: translate3d(0, 0, 0) scale(0.95); opacity: 0.55; }
  50% { transform: translate3d(8%, -6%, 0) scale(1.2); opacity: 0.95; }
}
@keyframes landingAuroraC {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1.05); opacity: 0.5; }
  50% { transform: translate3d(-10%, 5%, 0) scale(0.9); opacity: 0.9; }
}
@keyframes landingAuroraRing {
  0%, 100% { transform: scale(0.88); opacity: 0.35; }
  50% { transform: scale(1.08); opacity: 0.75; }
}
@media (prefers-reduced-motion: reduce) {
  .landing-hero-aurora__sheet,
  .landing-hero-aurora__ring { animation: none !important; opacity: 0.55; }
}
`;
