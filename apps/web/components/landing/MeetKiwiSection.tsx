"use client";

import { SectionEyebrow } from "./SectionEyebrow";
import { HudCoreBubble } from "@/components/shared/HudCoreBubble";
import { JarvisDemoButton } from "./JarvisDemoButton";
import { Reveal } from "./Reveal";

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
      <Reveal>
        <SectionEyebrow label="§ 03 · MEET KIWI" />
        <h2 className="mt-2 font-semibold text-[32px] leading-[1.15] tracking-[-0.01em] text-[var(--sd-ink)]">
          And here&rsquo;s the bird.
        </h2>
      </Reveal>

      {/* Identity card — bubble visual on left, name + role + tagline on right. */}
      <Reveal i={1} className="mt-8 flex flex-col md:flex-row md:items-start md:gap-8">
        <div className="flex-shrink-0 mx-auto md:mx-0 agent-mode-scope">
          <div className="flex h-[180px] w-[180px] items-center justify-center rounded-[14px] border border-[var(--sd-line)] bg-[var(--sd-box)]">
            <div
              style={{ transform: "scale(0.62)", transformOrigin: "center" }}
            >
              <HudCoreBubble state="thinking" />
            </div>
          </div>
        </div>

        <div className="mt-6 md:mt-0 flex-1 text-center md:text-left">
          <p className="text-[28px] font-semibold leading-[1.15] tracking-[-0.01em] text-[var(--sd-ink)]">
            Kiwi
            <span className="ml-3 align-middle font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--sd-accent)]">
              a.k.a. JARVIS
            </span>
          </p>
          <p className="mt-2 italic text-[18px] leading-[1.5] text-[var(--sd-ink-dull)]">
            A friendly, all-knowing orchestrator native to your life-OS.
          </p>
          <p className="mt-2 font-mono text-[12px] text-[var(--sd-ink-faint)] tracking-[0.06em]">
            Role: orchestrator · Native to: Hyperpolymath
          </p>
          <div className="mt-4">
            <JarvisDemoButton />
          </div>
        </div>
      </Reveal>

      {/* Prose flows below the identity card at a 720px measure. First
          person, in JARVIS's voice — the section IS the agent speaking. */}
      <Reveal i={2} as="div" className="mt-10 max-w-[720px] mx-auto md:mx-0 space-y-4">
        <p className="text-[18px] leading-[1.6] text-[var(--sd-ink)]">
          I am the agent at the heart of Hyperpolymath. Friendly,
          patient, and disarmingly literal. I am also (technically){" "}
          <a
            href="https://en.wikipedia.org/wiki/J.A.R.V.I.S."
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[var(--sd-ink-faint)] decoration-1 underline-offset-[3px] transition-colors hover:text-[var(--sd-accent)] hover:decoration-[var(--sd-accent)]"
          >
            JARVIS
          </a>
          , the name Filippo gave me when he first wired up the schema.
          Same bird, fancier name. (Yes, the Tony Stark one.)
        </p>

        <p className="text-[18px] leading-[1.6] text-[var(--sd-ink)]">
          My one and only job is to be an{" "}
          <span className="font-semibold">orchestrator</span>. You type at
          the prompt, or hold ⌘+J and speak. Either modality is
          first-class. I read what you wrote, decide which of your five
          primitives it belongs to (an area, a project, a capture, a
          calendar event, or one of your tasks), and route it to the
          right place. That&rsquo;s the whole loop. No vibes, no
          improvisation, no opinions about your goals.
        </p>

        <p className="text-[18px] leading-[1.6] text-[var(--sd-ink)]">
          &ldquo;All-knowing&rdquo; is literal, but bounded. I know
          everything inside your Hyperpolymath: which areas you have,
          what projects sit under them, what&rsquo;s in your calendar,
          what you captured at 2am last Tuesday. I do not know anything
          outside of it, and I will not pretend to. When something is
          ambiguous I ask. When something is unfamiliar I refuse rather
          than guess.
        </p>

        <p className="text-[18px] leading-[1.6] text-[var(--sd-ink)]">
          Under the hood I am powered by the LLM of choice in the backend,
          wrapped in a strict Zod schema with Strict Tool Use. The schema
          is my contract. The model is constrained to it at generation
          time, which is why I never invent a tool that doesn&rsquo;t exist
          and never emit a malformed action. The Engine section below walks
          through exactly what that looks like.
        </p>
      </Reveal>
    </section>
  );
}
