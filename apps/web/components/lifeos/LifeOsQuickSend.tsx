"use client";

import { LiteJarvisComposer } from "@/components/jarvis/LiteJarvisComposer";
import { SectionHeader } from "@/components/spacedrive";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";

/**
 * LifeOsQuickSend — JARVIS quick-send box on /lifeos between the banner and
 * the Areas tree. Submissions stash the text in sessionStorage under
 * 'jarvis-prefill' and navigate to /today, where JarvisConsole consumes the
 * prefill once on mount and fires it through the standard /api/jarvis flow.
 *
 * No new endpoint, no duplicated streaming logic — the existing console owns
 * the turn pipeline; this just hands off the seed text.
 */
export function LifeOsQuickSend() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  function handleSubmit(text: string) {
    try {
      sessionStorage.setItem("jarvis-prefill", text);
    } catch {
      // sessionStorage unavailable (private mode, etc.) — fall through and
      // navigate without prefill rather than blocking the user.
    }
    router.push("/today");
  }

  const animProps = prefersReducedMotion
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: {
          duration: 0.36,
          delay: 0.08,
          ease: [0.25, 1, 0.5, 1] as const,
        },
      };

  return (
    <motion.section aria-label="Quick Send" className="mb-8" {...animProps}>
      <SectionHeader
        title="Quick Send"
        eyebrow
        action={
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--deck-ink-faint)]">
            JARVIS handoff
          </span>
        }
        className="mb-2 px-1"
      />
      <LiteJarvisComposer onSubmit={handleSubmit} />
    </motion.section>
  );
}

export default LifeOsQuickSend;
