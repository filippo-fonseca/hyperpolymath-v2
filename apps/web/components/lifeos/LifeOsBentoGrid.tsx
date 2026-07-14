"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { CollapseChevron, usePersistedCollapse } from "./useSectionToggle";

interface Props {
  hero: ReactNode;
  topRight: ReactNode;
  midRight: ReactNode;
  bottom: ReactNode;
}

// Campaign motion signature (decision D4): entrances opacity 0->1, y 4->0,
// 160ms easeOut, 10ms stagger. Transform/opacity only — zero layout shift.
const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.01,
      delayChildren: 0.04,
    },
  },
};

const child = {
  hidden: { opacity: 0, y: 4 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.16, ease: "easeOut" as const },
  },
};

/**
 * LifeOsBentoGrid — the 12-column widget grid (UI-CONTRACT §6).
 *
 *   wide:              narrow:
 *   ┌────────┬────┐    ┌─────────┐
 *   │        │ A  │    │  hero   │
 *   │  hero  ├────┤    ├─────────┤
 *   │  (8)   │ B  │    │    A    │
 *   ├────────┴────┤    ├─────────┤
 *   │ bottom (12) │    │    B    │
 *   └─────────────┘    ├─────────┤
 *                      │ bottom  │
 *                      └─────────┘
 *
 * Tasks takes 8 of 12 columns across two rows — the most action-dense tile earns
 * the most surface. Habits and Training stack in the remaining 4. Captures spans
 * the full 12 and reads as a wide stream of flat sub-cards.
 */
export function LifeOsBentoGrid({ hero, topRight, midRight, bottom }: Props) {
  const reduced = useReducedMotion();
  const [collapsed, toggle] = usePersistedCollapse("lifeos:widgets:collapsed");

  const grid = reduced ? (
    <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-12 @3xl/main:auto-rows-[minmax(180px,auto)]">
      <div className="@3xl/main:col-span-8 @3xl/main:row-span-2">{hero}</div>
      <div className="@3xl/main:col-span-4">{topRight}</div>
      <div className="@3xl/main:col-span-4">{midRight}</div>
      <div className="@3xl/main:col-span-12">{bottom}</div>
    </div>
  ) : (
    <motion.div
      className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-12 @3xl/main:auto-rows-[minmax(180px,auto)]"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={child} className="@3xl/main:col-span-8 @3xl/main:row-span-2">
        {hero}
      </motion.div>
      <motion.div variants={child} className="@3xl/main:col-span-4">
        {topRight}
      </motion.div>
      <motion.div variants={child} className="@3xl/main:col-span-4">
        {midRight}
      </motion.div>
      <motion.div variants={child} className="@3xl/main:col-span-12">
        {bottom}
      </motion.div>
    </motion.div>
  );

  return (
    <section className="mb-7">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-[var(--sd-ink)]">
            Widgets
          </h2>
          <CollapseChevron collapsed={collapsed} onClick={toggle} label="widgets" />
        </div>
      </header>
      <motion.div
        initial={false}
        animate={{ height: collapsed ? 0 : "auto", opacity: collapsed ? 0 : 1 }}
        transition={reduced ? { duration: 0 } : { duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
        style={{ overflow: "hidden" }}
      >
        {/* pb keeps the bottom border hairline off the overflow-hidden clip */}
        <div className="pb-1">{grid}</div>
      </motion.div>
    </section>
  );
}
