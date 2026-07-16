"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

/**
 * v1 signature thinking-word indicator (D-13, JARVIS-08).
 *
 * Curated list — British register + brand voice. Cycles ~600ms while
 * waiting for the first SSE chunk or first content_block_stop on a
 * tool_use. Parent (JarvisScrollback) controls `active` and stops it
 * the moment the first receipt streams in.
 *
 * Render contract: renders within 100ms (no async work in mount;
 * first word visible synchronously). The aria-live polite region
 * keeps screen readers informed without barging.
 */

const WORDS = [
  "thinking",
  "considering",
  "parsing",
  "routing",
  "checking",
  "polishing",
  "annotating",
  "noting",
  "scheduling",
  "indexing",
  "jarvis-ing",
] as const;

const INTERVAL_MS = 600;

export function ThinkingWord({ active }: { active: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % WORDS.length);
    }, INTERVAL_MS);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;

  return (
    <span
      className="inline-flex items-center font-mono text-sm text-[var(--sd-ink-dull)]"
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={WORDS[index]}
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.2 }}
        >
          {WORDS[index]}
        </motion.span>
      </AnimatePresence>
      <span className="ml-1 animate-pulse">…</span>
    </span>
  );
}
