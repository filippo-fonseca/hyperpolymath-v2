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
      className="dark relative isolate flex min-h-[100svh] w-full max-w-[100vw] flex-col items-center justify-center overflow-x-clip px-5 py-20 sm:px-6 sm:py-24 md:px-10 md:py-28"
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

        {/* ONE glossy focal orb — the canonical CSS/SVG sphere, sitting above
            the headline like the spacedrive.com reference composition. Its own
            under-glow + slow bob carry the focal light source the headline
            punches out of. */}
        <motion.div
          {...fade(1)}
          className="mt-7 flex h-[144px] w-[144px] items-center justify-center sm:mt-8 md:mt-10 md:h-[176px] md:w-[176px]"
        >
          <div className="origin-center scale-[0.82] md:scale-100">
            <FocalOrb size={176} />
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
