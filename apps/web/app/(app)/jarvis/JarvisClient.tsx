"use client";

/**
 * JarvisClient — the centralized JARVIS hub shell (Spacedrive register).
 *
 * A flat sd section rail (`--sd-box` plate, hairline chrome, inset top hairline)
 * switches the content pane between the three editable surfaces — Routines,
 * Personality, Startup & Briefing — and offers quick links out to the agent's
 * Memory ledger and Personal Context. The active rail item takes a single cyan
 * tint (accent-only, no glow rings, no neumorphic lift); idle items sit flat and
 * warm on hover. This is JARVIS's own home: cyan-on-dark precision, mono labels.
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
  title: string;
  description: string;
}

const SECTIONS: SectionMeta[] = [
  {
    key: "routines",
    label: "Routines",
    icon: Repeat,
    title: "Routines",
    description:
      "Give JARVIS a trigger and an ordered list of smart blocks. When the trigger fires — a wake phrase, a time of day, a hotkey — it runs each block in turn.",
  },
  {
    key: "personality",
    label: "Personality",
    icon: Bot,
    title: "Personality",
    description:
      "Tune the spoken voice. Pick a preset, nudge the formality, verbosity, and wit dials, and layer on freeform instructions.",
  },
  {
    key: "startup",
    label: "Startup & Briefing",
    icon: Rocket,
    title: "Startup & Briefing",
    description:
      "Shape the first moments after launch — the spoken briefing, what opens on start, and the shortcuts JARVIS primes.",
  },
];

interface SurfaceLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

const SURFACES: SurfaceLink[] = [
  { href: "/settings/memory", label: "Memory", icon: Brain },
  { href: "/settings/context", label: "Personal context", icon: Network },
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
        <div className="rounded-2xl border border-[var(--sd-line)] bg-[var(--sd-box)] p-2 shadow-[var(--shadow-card)] dark:border-white/[0.06] dark:[box-shadow:rgba(255,255,255,0.09)_0_1px_0_inset,var(--shadow-card)]">
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-label="JARVIS management sections"
            className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible"
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

          <div className="my-2 hidden h-px bg-[var(--sd-line)] md:block" />

          <p className="hidden px-2.5 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--sd-ink-faint)] md:block">
            Agent surfaces
          </p>

          <div className="mt-1.5 flex gap-1 overflow-x-auto md:mt-0 md:flex-col md:overflow-visible">
            {SURFACES.map((s) => (
              <SurfaceItem key={s.href} link={s} />
            ))}
          </div>
        </div>
      </nav>

      {/* ---- Content pane --------------------------------------------------- */}
      <div className="min-w-0 flex-1">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold tracking-[-0.01em] text-[var(--sd-ink)]">
            {activeMeta.title}
          </h2>
          <p className="mt-1.5 max-w-[620px] text-[14px] leading-[1.55] text-[var(--sd-ink-dull)]">
            {activeMeta.description}
          </p>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section}
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.14, ease: [0.25, 1, 0.5, 1] }}
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
      style={
        active
          ? {
              background: "color-mix(in oklch, var(--sd-accent) 12%, var(--sd-box))",
              boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--sd-accent) 30%, transparent)",
            }
          : undefined
      }
      className={cn(
        "group relative flex w-full shrink-0 items-center gap-3 rounded-[10px] px-2.5 py-2 text-left",
        "transition-colors duration-[140ms] ease-out cursor-pointer-always",
        !active && "hover:bg-[var(--sd-hover)]",
      )}
    >
      <span
        style={
          active
            ? {
                background: "color-mix(in oklch, var(--sd-accent) 16%, transparent)",
                boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--sd-accent) 32%, transparent)",
              }
            : { background: "var(--sd-input)" }
        }
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-[9px] transition-colors duration-[140ms]",
          active ? "text-[var(--sd-accent)]" : "text-[var(--sd-ink-dull)]",
        )}
      >
        <Icon size={16} strokeWidth={active ? 2 : 1.6} aria-hidden="true" />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors duration-[140ms]",
          active ? "text-[var(--sd-accent)]" : "text-[var(--sd-ink-dull)] group-hover:text-[var(--sd-ink)]",
        )}
      >
        {meta.label}
      </span>
    </button>
  );
}

function SurfaceItem({ link }: { link: SurfaceLink }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      className={cn(
        "group flex shrink-0 items-center gap-3 rounded-[10px] px-2.5 py-2",
        "transition-colors duration-[140ms] ease-out cursor-pointer-always",
        "hover:bg-[var(--sd-hover)]",
      )}
    >
      <span
        style={{ background: "var(--sd-input)" }}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-[var(--sd-ink-dull)] transition-colors duration-[140ms] group-hover:text-[var(--sd-ink)]"
      >
        <Icon size={16} strokeWidth={1.6} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-dull)] transition-colors duration-[140ms] group-hover:text-[var(--sd-ink)]">
        {link.label}
      </span>
      <ArrowUpRight
        size={14}
        aria-hidden="true"
        className="hidden shrink-0 text-[var(--sd-ink-faint)] opacity-0 transition-opacity duration-[140ms] group-hover:opacity-100 md:block"
      />
    </Link>
  );
}
