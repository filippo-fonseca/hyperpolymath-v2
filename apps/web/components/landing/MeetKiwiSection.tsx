"use client";

import { SectionEyebrow } from "./SectionEyebrow";
import { HudCoreBubble } from "@/components/shared/HudCoreBubble";
import { JarvisDemoButton } from "./JarvisDemoButton";

/**
 * §03 — MEET KIWI. Parallel to §02 WHO (Filippo's bio); this section is
 * the agent's bio. Introduces the kiwi-bird mascot for JARVIS, names
 * orchestrator as the one job, and explains what "all-knowing within
 * your life-OS" actually means.
 *
 * Mirrors BioSection's structure: identity visual on the left, name +
 * credentials on the right, prose below at a 720px measure. Uses
 * HudCoreBubble as the "portrait" since that's the same visual that
 * represents the agent everywhere else (hero + in-app console + sidebar
 * About Kiwi modal).
 *
 * Phase 8 Plan 08-06 gap closure — user requested an explainer section
 * for Kiwi (the friendly all-knowing kiwi-bird orchestrator).
 */
export function MeetKiwiSection() {
  return (
    <section className="py-16 max-w-[920px] mx-auto px-6 md:px-10">
      <SectionEyebrow label="§ 03 · MEET KIWI" />
      <h2 className="mt-2 font-serif font-semibold text-[32px] leading-[1.2] text-[var(--ink)]">
        And here&rsquo;s the bird.
      </h2>

      {/* Identity card — bubble visual on left, name + role + tagline on right. */}
      <div className="mt-8 flex flex-col md:flex-row md:items-start md:gap-8">
        <div className="flex-shrink-0 mx-auto md:mx-0 agent-mode-scope">
          <div
            style={{
              width: 180,
              height: 180,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "16px",
              border: "1px solid var(--edge-hud)",
              background: "var(--surface-raised)",
              boxShadow: "var(--glow-hud-subtle)",
            }}
          >
            <div
              style={{ transform: "scale(0.62)", transformOrigin: "center" }}
            >
              <HudCoreBubble state="thinking" />
            </div>
          </div>
        </div>

        <div className="mt-6 md:mt-0 flex-1 text-center md:text-left">
          <p
            className="font-serif text-[28px] font-semibold leading-[1.2]"
            style={{ color: "var(--ink)" }}
          >
            Kiwi
            <span
              className="ml-3 font-mono text-[14px] font-medium uppercase tracking-[0.14em] align-middle"
              style={{ color: "var(--hud-cyan-light)" }}
            >
              a.k.a. JARVIS
            </span>
          </p>
          <p className="mt-2 font-serif italic text-[18px] leading-[1.5] text-[var(--ink-muted)]">
            A friendly, all-knowing orchestrator native to your life-OS.
          </p>
          <p className="mt-2 font-mono text-[14px] text-[var(--ink-muted)] tracking-[0.04em]">
            Role: orchestrator · Native to: Hyperpolymath
          </p>
          <div className="mt-4">
            <JarvisDemoButton />
          </div>
        </div>
      </div>

      {/* Prose flows below the identity card at a 720px measure. First
          person, in JARVIS's voice — the section IS the agent speaking. */}
      <div className="mt-10 max-w-[720px] mx-auto md:mx-0 space-y-4">
        <p className="font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
          I am the agent at the heart of Hyperpolymath. Friendly,
          patient, and disarmingly literal. I am also (technically){" "}
          <a
            href="https://en.wikipedia.org/wiki/J.A.R.V.I.S."
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[var(--ink-muted)] decoration-1 underline-offset-[3px] transition-colors hover:text-[var(--hud-cyan)] hover:decoration-[var(--hud-cyan)]"
          >
            JARVIS
          </a>
          , the name Filippo gave me when he first wired up the schema.
          Same bird, fancier name. (Yes, the Tony Stark one.)
        </p>

        <p className="font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
          My one and only job is to be an{" "}
          <span className="font-semibold">orchestrator</span>. You type at
          the prompt, or hold ⌘+J and speak. Either modality is
          first-class. I read what you wrote, decide which of your five
          primitives it belongs to (an area, a project, a capture, a
          calendar event, or one of your tasks), and route it to the
          right place. That&rsquo;s the whole loop. No vibes, no
          improvisation, no opinions about your goals.
        </p>

        <p className="font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
          &ldquo;All-knowing&rdquo; is literal, but bounded. I know
          everything inside your Hyperpolymath — which areas you have,
          what projects sit under them, what&rsquo;s in your calendar,
          what you captured at 2am last Tuesday. I do not know anything
          outside of it, and I will not pretend to. When something is
          ambiguous I ask. When something is unfamiliar I refuse rather
          than guess.
        </p>

        <p className="font-serif text-[18px] leading-[1.6] text-[var(--ink)]">
          Under the hood I am Claude Sonnet 4.6 wrapped in a strict Zod
          schema with the Strict Tool Use beta enabled. The schema is my
          contract. The model is constrained to it at generation time,
          which is why I never invent a tool that doesn&rsquo;t exist and
          never emit a malformed action. The Engine section below walks
          through exactly what that looks like.
        </p>
      </div>
    </section>
  );
}
