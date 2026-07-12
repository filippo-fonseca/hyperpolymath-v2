"use client";

import { SectionHeader } from "@/components/spacedrive";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { CollapseChevron, usePersistedCollapse } from "./useSectionToggle";

interface Props {
  hero: ReactNode;
  topRight: ReactNode;
  midRight: ReactNode;
  bottom: ReactNode;
}

const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.18,
    },
  },
};

const child = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: [0.25, 1, 0.5, 1] as const },
  },
};

/**
 * LifeOsBentoGrid — asymmetric bento layout for the at-a-glance widgets.
 *
 *   lg+:           sm/md:
 *   ┌───────┬───┐  ┌─────────┐
 *   │       │ A │  │  hero   │
 *   │ hero  ├───┤  ├─────────┤
 *   │       │ B │  │    A    │
 *   ├───────┴───┤  ├─────────┤
 *   │  bottom   │  │    B    │
 *   └───────────┘  ├─────────┤
 *                   │ bottom  │
 *                   └─────────┘
 *
 * Hero spans 2 columns × 2 rows on lg+, so the most action-dense tile (tasks)
 * gets the most visual weight. topRight + midRight share the right column.
 * Bottom spans full width — captures read well as a wide stream.
 */
export function LifeOsBentoGrid({ hero, topRight, midRight, bottom }: Props) {
  const reduced = useReducedMotion();
  const [collapsed, toggle] = usePersistedCollapse("lifeos:widgets:collapsed");

  const grid = reduced ? (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12 lg:auto-rows-[minmax(180px,auto)]">
      <div className="min-w-0 lg:col-span-8 lg:row-span-2">{hero}</div>
      <div className="min-w-0 lg:col-span-4">{topRight}</div>
      <div className="min-w-0 lg:col-span-4">{midRight}</div>
      <div className="min-w-0 lg:col-span-12">{bottom}</div>
    </div>
  ) : (
    <motion.div
      className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12 lg:auto-rows-[minmax(180px,auto)]"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={child} className="min-w-0 lg:col-span-8 lg:row-span-2">
        {hero}
      </motion.div>
      <motion.div variants={child} className="min-w-0 lg:col-span-4">
        {topRight}
      </motion.div>
      <motion.div variants={child} className="min-w-0 lg:col-span-4">
        {midRight}
      </motion.div>
      <motion.div variants={child} className="min-w-0 lg:col-span-12">
        {bottom}
      </motion.div>
    </motion.div>
  );

  return (
    <section className="mb-10">
      <SectionHeader
        title="Today / work"
        eyebrow
        action={<CollapseChevron collapsed={collapsed} onClick={toggle} label="widgets" />}
        className="mb-2 px-1"
      />
      <motion.div
        initial={false}
        animate={{ height: collapsed ? 0 : "auto", opacity: collapsed ? 0 : 1 }}
        transition={reduced ? { duration: 0 } : { duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
        style={{ overflow: "hidden" }}
      >
        {/* pb keeps tile glow/halo from clipping against overflow-hidden */}
        <div className="pb-1">{grid}</div>
      </motion.div>
    </section>
  );
}
