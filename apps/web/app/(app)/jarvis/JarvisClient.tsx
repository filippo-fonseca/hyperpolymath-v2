"use client";

/**
 * JarvisClient — the centralized JARVIS hub shell.
 *
 * A neumorphic section rail (soft-extruded glass panel in the app's --glass-*
 * register) switches the content pane between the three editable surfaces —
 * Routines, Personality, Startup & Briefing — and offers quick links out to the
 * agent's Memory ledger and Personal Context. The active rail item lifts onto a
 * raised surface with a whisper of cyan (accent-only, matching the receipt-card
 * vocabulary); idle items sit flat and warm on hover.
 *
 * All three editors are seeded with SSR-prefetched data and own their own save
 * flow. The selected section is mirrored into ?section= (via replaceState, no
 * RSC refetch) so refreshes and deep links land where you left off.
 */

import { cn } from "@/lib/utils";
import type { PersonalityConfig, Routine, StartupConfig } from "@hyperpolymath/jarvis-core";
import { ArrowUpRight, Bot, Brain, type LucideIcon, Network, Repeat, Rocket } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { PersonalityEditor } from "./PersonalityEditor";
import { StartupEditor } from "./StartupEditor";
import { RoutinesClient } from "./routines/RoutinesClient";

export type JarvisSection = "routines" | "personality" | "startup";

interface Props {
  userId: string;
  initialSection: JarvisSection;
  initialPersonality: PersonalityConfig;
  initialStartup: StartupConfig;
  initialRoutines: Routine[];
}

interface SectionMeta {
  key: JarvisSection;
  label: string;
  icon: LucideIcon;
  ink: string;
  title: string;
  description: string;
}

const SECTIONS: SectionMeta[] = [
  {
    key: "routines",
    label: "Routines",
    icon: Repeat,
    ink: "var(--ink-amber)",
    title: "Routines",
    description:
      "Give JARVIS a trigger and an ordered list of smart blocks. When the trigger fires — a wake phrase, a time of day, a hotkey — it runs each block in turn.",
  },
  {
    key: "personality",
    label: "Personality",
    icon: Bot,
    ink: "var(--hud-cyan-light)",
    title: "Personality",
    description:
      "Tune the spoken voice. Pick a preset, nudge the formality, verbosity, and wit dials, and layer on freeform instructions.",
  },
  {
    key: "startup",
    label: "Startup & Briefing",
    icon: Rocket,
    ink: "var(--ink-coral)",
    title: "Startup & Briefing",
    description:
      "Shape the first moments after launch — the spoken briefing, what opens on start, and the shortcuts JARVIS primes.",
  },
];

interface SurfaceLink {
  href: string;
  label: string;
  icon: LucideIcon;
  ink: string;
}

const SURFACES: SurfaceLink[] = [
  {
    href: "/settings/memory",
    label: "Memory",
    icon: Brain,
    ink: "var(--hud-cyan-light)",
  },
  {
    href: "/settings/context",
    label: "Personal context",
    icon: Network,
    ink: "var(--ink-blue)",
  },
];

export function JarvisClient({
  userId,
  initialSection,
  initialPersonality,
  initialStartup,
  initialRoutines,
}: Props) {
  const [section, setSection] = useState<JarvisSection>(initialSection);
  const reducedMotion = useReducedMotion();

  const selectSection = useCallback((next: JarvisSection) => {
    setSection(next);
    // Mirror to the URL without a navigation/RSC refetch so refreshes and
    // deep links (e.g. the /settings/routines redirect) land on the right pane.
    if (typeof window !== "undefined") {
      const url = next === "routines" ? "/jarvis" : `/jarvis?section=${next}`;
      window.history.replaceState(null, "", url);
    }
  }, []);

  const activeMeta = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0];

  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-8">
      {/* ---- Section rail --------------------------------------------------- */}
      <nav
        aria-label="JARVIS sections"
        className="shrink-0 md:w-[252px] md:sticky md:top-6 md:self-start"
      >
        <div className="glass-tile rounded-2xl p-2.5">
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-label="JARVIS management sections"
            className="flex gap-1.5 overflow-x-auto md:flex-col md:overflow-visible"
          >
            {SECTIONS.map((s) => (
              <RailItem
                key={s.key}
                meta={s}
                active={section === s.key}
                onSelect={() => selectSection(s.key)}
              />
            ))}
          </div>

          <div className="my-2 hidden h-px bg-[color-mix(in_oklch,var(--edge)_60%,transparent)] md:block" />

          <p className="hidden px-3 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color-mix(in_oklch,var(--ink-muted)_75%,transparent)] md:block">
            Agent surfaces
          </p>

          <div className="mt-1.5 flex gap-1.5 overflow-x-auto md:mt-0 md:flex-col md:overflow-visible">
            {SURFACES.map((s) => (
              <SurfaceItem key={s.href} link={s} />
            ))}
          </div>
        </div>
      </nav>

      {/* ---- Content pane --------------------------------------------------- */}
      <div className="min-w-0 flex-1">
        <div className="mb-6">
          <h2 className="font-serif text-2xl font-semibold text-[var(--ink)]">
            {activeMeta.title}
          </h2>
          <p className="mt-1.5 max-w-[620px] font-serif text-[14.5px] leading-[1.55] text-[var(--ink-muted)]">
            {activeMeta.description}
          </p>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: [0.25, 1, 0.5, 1] }}
          >
            {section === "routines" && (
              <RoutinesClient userId={userId} initialRoutines={initialRoutines} />
            )}
            {section === "personality" && <PersonalityEditor initial={initialPersonality} />}
            {section === "startup" && <StartupEditor initial={initialStartup} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function RailItem({
  meta,
  active,
  onSelect,
}: {
  meta: SectionMeta;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = meta.icon;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      style={{ "--section-ink": meta.ink } as React.CSSProperties}
      className={cn(
        "group relative flex w-full shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left",
        "transition-all duration-200 ease-out cursor-pointer-always",
        active
          ? "bg-[var(--surface-raised)] shadow-[var(--glass-raise-sm),var(--glass-drop-sm),inset_0_1px_0_var(--glass-hi),inset_0_0_0_1px_color-mix(in_oklch,var(--hud-cyan)_26%,transparent),inset_0_0_22px_color-mix(in_oklch,var(--hud-cyan)_6%,transparent)]"
          : "hover:bg-[color-mix(in_oklch,var(--surface-raised)_55%,transparent)]"
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all duration-200",
          active
            ? "bg-[color-mix(in_oklch,var(--hud-cyan)_14%,var(--canvas))] text-[var(--hud-cyan)] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--hud-cyan)_32%,transparent)]"
            : "bg-[var(--canvas)] text-[var(--section-ink)] shadow-[inset_1px_1px_2px_color-mix(in_oklch,var(--ink)_10%,transparent),inset_-1px_-1px_2px_color-mix(in_oklch,white_70%,transparent)]"
        )}
      >
        <Icon size={16} strokeWidth={active ? 2 : 1.6} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-200",
            active ? "text-[var(--hud-cyan)]" : "text-[var(--ink)] group-hover:text-[var(--ink)]"
          )}
        >
          {meta.label}
        </span>
      </span>
    </button>
  );
}

function SurfaceItem({ link }: { link: SurfaceLink }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      style={{ "--section-ink": link.ink } as React.CSSProperties}
      className={cn(
        "group flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5",
        "transition-all duration-200 ease-out cursor-pointer-always",
        "hover:bg-[color-mix(in_oklch,var(--surface-raised)_55%,transparent)]"
      )}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--canvas)] text-[var(--section-ink)] shadow-[inset_1px_1px_2px_color-mix(in_oklch,var(--ink)_10%,transparent),inset_-1px_-1px_2px_color-mix(in_oklch,white_70%,transparent)] transition-transform duration-200 group-hover:-translate-y-0.5">
        <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ink-muted)] transition-colors duration-200 group-hover:text-[var(--ink)]">
        {link.label}
      </span>
      <ArrowUpRight
        size={14}
        aria-hidden="true"
        className="hidden shrink-0 text-[var(--ink-muted)] opacity-0 transition-opacity duration-200 group-hover:opacity-100 md:block"
      />
    </Link>
  );
}
