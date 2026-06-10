"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * LandingSideNav — fixed vertical chapter index on the right edge.
 *
 * Each entry corresponds to a section anchor on the landing page.
 * IntersectionObserver tracks which section's top is in the upper
 * third of the viewport; that's the "active" entry. Click anywhere
 * on an entry to smooth-scroll to its section.
 *
 * Visual register matches the rest of the landing: mono uppercase
 * labels in tracking-[0.18em], a thin vertical hairline running
 * through the dots, dim ink-muted for inactive, JARVIS cyan for
 * active. Labels collapse to the dot on the right edge until the
 * user hovers — keeps the right rail visually quiet.
 *
 * Only renders on lg+ viewports so it never crowds mobile / tablet.
 */

const ENTRIES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "thesis", label: "Thesis" },
  { id: "bio", label: "Who" },
  { id: "kiwi", label: "Meet Kiwi" },
  { id: "demo", label: "Live Demo" },
  { id: "primitives", label: "Primitives" },
  { id: "engine", label: "Engine" },
  { id: "mcp", label: "MCP Server" },
  { id: "surface", label: "Surface" },
  { id: "stack", label: "Stack" },
  { id: "architecture", label: "Architecture" },
  { id: "framework", label: "Framework" },
  { id: "choice", label: "Choice" },
  { id: "buildlog", label: "Build Log" },
];

export function LandingSideNav() {
  const reducedMotion = useReducedMotion();
  const [activeId, setActiveId] = useState<string>(ENTRIES[0].id);
  const [hovered, setHovered] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Observe every section anchor; the entry whose top crosses the
  // upper-third threshold becomes active.
  useEffect(() => {
    const elements = ENTRIES.map(({ id }) =>
      document.getElementById(id),
    ).filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const visibility = new Map<string, number>();

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visibility.set(entry.target.id, entry.intersectionRatio);
        }
        let winner: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visibility) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            winner = id;
          }
        }
        if (winner) setActiveId(winner);
      },
      {
        // Bias toward the upper third of the viewport so the active
        // marker matches what's "at top of screen", not what's
        // taking up the most pixels.
        rootMargin: "-25% 0px -55% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      },
    );

    elements.forEach((el) => obs.observe(el));
    observerRef.current = obs;
    return () => obs.disconnect();
  }, []);

  function go(id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <nav
      aria-label="Section navigation"
      className="hidden lg:flex fixed left-6 top-1/2 -translate-y-1/2 z-30 flex-col items-start gap-3 select-none"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {ENTRIES.map((entry) => {
        const isActive = entry.id === activeId;
        return (
          <button
            type="button"
            key={entry.id}
            onClick={() => go(entry.id)}
            className="group flex items-center gap-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hud-cyan)] rounded-sm pr-1 pl-0.5 py-0.5"
            aria-current={isActive ? "true" : undefined}
            aria-label={`Go to ${entry.label} section`}
          >
            <motion.span
              aria-hidden="true"
              className="block rounded-full"
              initial={false}
              animate={{
                width: isActive ? 18 : 6,
                height: isActive ? 2 : 6,
                backgroundColor: isActive
                  ? "var(--hud-cyan)"
                  : "var(--ink-muted)",
                opacity: isActive ? 1 : hovered ? 0.85 : 0.45,
              }}
              transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
            />
            <motion.span
              className="font-mono text-[10px] tracking-[0.22em] uppercase"
              initial={false}
              animate={{
                opacity: hovered || isActive ? 1 : 0,
                x: hovered || isActive ? 0 : -6,
                color: isActive
                  ? "var(--hud-cyan-light)"
                  : "var(--ink-muted)",
              }}
              transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
            >
              {entry.label}
            </motion.span>
          </button>
        );
      })}
    </nav>
  );
}
