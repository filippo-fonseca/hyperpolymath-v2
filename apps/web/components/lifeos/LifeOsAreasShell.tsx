"use client";

import { DeckPanel, SectionHeader } from "@/components/spacedrive";
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
    <motion.section aria-labelledby="lifeos-system-map-title" className="mb-10" {...animProps}>
      <h2 id="lifeos-system-map-title" className="sr-only">
        System map
      </h2>
      <SectionHeader
        title="System map"
        eyebrow
        className="mb-2 px-1"
        action={
          <>
            <CollapseChevron collapsed={collapsed} onClick={toggle} label="areas" />
            <Link
              href="/areas"
              className="rounded-md px-1.5 py-1 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--deck-ink-dull)] transition-colors [transition-duration:var(--dur-hover)] hover:text-[var(--deck-ink)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            >
              Open full view →
            </Link>
          </>
        }
      />
      <motion.div
        initial={false}
        animate={{ height: collapsed ? 0 : "auto", opacity: collapsed ? 0 : 1 }}
        transition={
          prefersReducedMotion ? { duration: 0 } : { duration: 0.32, ease: [0.25, 1, 0.5, 1] }
        }
        style={{ overflow: "hidden" }}
      >
        <DeckPanel tone="deep" className="overflow-hidden p-2 sm:p-3">
          {children}
        </DeckPanel>
      </motion.div>
    </motion.section>
  );
}
