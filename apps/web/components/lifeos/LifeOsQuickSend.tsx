"use client";

import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { LiteJarvisComposer } from "@/components/jarvis/LiteJarvisComposer";

/**
 * LifeOsQuickSend — JARVIS quick-send box on /lifeos between the banner and
 * the Areas tree. Submissions stash the text in sessionStorage under
 * 'jarvis-prefill' and navigate to /today, where JarvisConsole consumes the
 * prefill once on mount and fires it through the standard /api/jarvis flow.
 *
 * No new endpoint, no duplicated streaming logic — the existing console owns
 * the turn pipeline; this just hands off the seed text.
 *
 * aug-04 craft-ui-v2: the composer wears `.craft-pill` (white pill, hairline,
 * shadow-card, hover shadow lift). The class lands after the composer's own
 * `craft-glass-tile rounded-xl` and, being declared later in globals.css,
 * wins fill/border/shadow/radius by cascade; every key/send behavior in
 * LiteJarvisComposer is untouched.
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
    <motion.section {...animProps}>
      <LiteJarvisComposer onSubmit={handleSubmit} className="craft-pill" />
    </motion.section>
  );
}

export default LifeOsQuickSend;
