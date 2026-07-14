"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CollapseChevron, usePersistedCollapse } from "./useSectionToggle";

/**
 * LifeOsAreasShell — thin client wrapper that owns the mount animation for
 * the Areas section on /lifeos. The parent LifeOsAreasSection stays a Server
 * Component (it does the auth + sidebar fetch) and renders this shell with
 * the already-fetched tree as children.
 *
 * Mount animation: fade+y(8), 360ms, delay 0.16s (third in the staggered
 * sequence after banner → quick-send). Reduced-motion → snap.
 */
export function LifeOsAreasShell({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();
  const [collapsed, toggle] = usePersistedCollapse("lifeos:areas:collapsed");
  const animProps = prefersReducedMotion
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: {
          duration: 0.36,
          delay: 0.16,
          ease: [0.25, 1, 0.5, 1] as const,
        },
      };

  return (
    <motion.section className="mb-12" {...animProps}>
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--ink)]">
            Areas
          </h2>
          <CollapseChevron collapsed={collapsed} onClick={toggle} label="areas" />
        </div>
        <Link
          href="/areas"
          className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer-always"
        >
          Open full view →
        </Link>
      </header>
      <motion.div
        initial={false}
        animate={{ height: collapsed ? 0 : "auto", opacity: collapsed ? 0 : 1 }}
        transition={
          prefersReducedMotion ? { duration: 0 } : { duration: 0.32, ease: [0.25, 1, 0.5, 1] }
        }
        style={{ overflow: "hidden" }}
      >
        {children}
      </motion.div>
    </motion.section>
  );
}
