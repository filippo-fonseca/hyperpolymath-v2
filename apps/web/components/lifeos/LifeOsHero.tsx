"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { format } from "date-fns";
import { FocalOrb } from "@/components/ui/ambient";
import {
  AreaIcon,
  CaptureIcon,
  HabitIcon,
  InsightIcon,
  TaskIcon,
  TrainingIcon,
} from "@/components/ui/icons";

/**
 * A single dot tone. Functional hues appear ONLY as small status dots (D6);
 * numerals themselves stay in `--sd-ink`, never tinted.
 */
type DotTone = "danger" | "warn" | "active" | "synced" | null;

interface Stat {
  key: string;
  icon: ReactNode;
  label: string;
  /** Primary numeral (large, `font-black tabular-nums`, `--sd-ink`). */
  value: string;
  /** Optional unit/suffix riding the same baseline, e.g. the "/5" in "3/5". */
  unit?: string;
  caption: string;
  dot: DotTone;
  href: string;
}

interface Props {
  displayName?: string | null;
  openTasksTotal: number;
  tasksDueToday: number;
  tasksOverdue: number;
  habitsDone: number;
  habitsTotal: number;
  capturesThisWeek: number;
  trainingPlanned: number;
  trainingDone: number;
  projectsActive: number;
  jarvisTurns: number;
}

function greeting(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Burning late";
}

/** Functional dot colour. Reuses the ladder inks (D6); never a raw hex. */
function dotColor(tone: DotTone): string | undefined {
  switch (tone) {
    case "danger":
      return "var(--ink-coral)";
    case "warn":
      return "var(--ink-amber)";
    case "active":
      return "var(--ink-sage)";
    case "synced":
      return "var(--sd-accent)";
    default:
      return undefined;
  }
}

/** Dimensional icon slot in the stat strip (UI-CONTRACT §5). */
const ICON_SIZE = 40;
/**
 * Optical size for AreaIcon. Every sibling draws a 54/80 rounded square that
 * fills its box, but AreaIcon's diamond spans 50/80 with only half the fill
 * area of a square that wide, so at a nominal 40 it reads about a third
 * smaller than the rest of the strip. Rendering it 1.3x brings its mass level;
 * the glyph still lands at 32.5px, inside the 40px slot, so the icon column
 * and every text baseline stay put.
 */
const DIAMOND_ICON_SIZE = 52;
/** Presence orb diameter (UI-CONTRACT §4; §9 bans orbs > 40px). */
const ORB_SIZE = 36;

/**
 * LifeOsHero — the /lifeos header: a greeting row and a stat strip, both
 * sitting directly on the canvas (UI-CONTRACT §4 + §5). The hero plate, the
 * bold ambient field and the 148px planet orb are gone (R1): no banner, no
 * gradient wash, no vignette.
 *
 * Greeting row: mono date line above a Space Grotesk 26px greeting whose only
 * colour is the terminal period in `--sd-accent` (R2 — no serif outside the
 * logotype, R4 — no glow). Right of it, a 36px presence orb reads as JARVIS's
 * presence lamp rather than a planet; it bobs gently at 6s and is static under
 * reduced motion.
 *
 * Stat strip: six stats, each an icon-left row of dimensional icon + text
 * stack (label / value / caption), no card chrome. Values are `font-black
 * tabular-nums` with a muted unit on the same baseline (§11); the caption
 * carries the one functional dot. Every stat links into the surface it
 * summarises. All numbers derive from props the server already fetched.
 *
 * Motion is the campaign signature (D4): opacity 0→1, y 4→0 at 160ms easeOut,
 * 10ms stagger per stat, `useReducedMotion` guard. Transform/opacity only and
 * the numerals are server-rendered, so there is zero layout shift on entrance
 * (D1d).
 */
export function LifeOsHero({
  displayName,
  openTasksTotal,
  tasksDueToday,
  tasksOverdue,
  habitsDone,
  habitsTotal,
  capturesThisWeek,
  trainingPlanned,
  trainingDone,
  projectsActive,
  jarvisTurns,
}: Props) {
  const reduced = useReducedMotion();
  const now = new Date();
  const firstName = displayName?.trim().split(/\s+/)[0] ?? "";

  const stats: Stat[] = [
    {
      key: "tasks",
      icon: <TaskIcon size={ICON_SIZE} />,
      label: "Open tasks",
      value: String(openTasksTotal),
      caption:
        tasksOverdue > 0
          ? `${tasksOverdue} overdue`
          : tasksDueToday > 0
            ? `${tasksDueToday} due today`
            : "all clear",
      dot: tasksOverdue > 0 ? "danger" : tasksDueToday > 0 ? "warn" : "active",
      href: "/tasks",
    },
    {
      key: "habits",
      icon: <HabitIcon size={ICON_SIZE} className="lifeos-stat-icon--habit" />,
      label: "Habits today",
      value: habitsTotal === 0 ? "0" : String(habitsDone),
      unit: habitsTotal === 0 ? undefined : `/${habitsTotal}`,
      caption:
        habitsTotal === 0
          ? "none set"
          : habitsDone === habitsTotal
            ? "complete"
            : `${habitsTotal - habitsDone} to go`,
      dot:
        habitsTotal === 0
          ? null
          : habitsDone === habitsTotal
            ? "active"
            : "synced",
      href: "/habits",
    },
    {
      key: "captures",
      icon: <CaptureIcon size={ICON_SIZE} />,
      label: "Captures",
      value: String(capturesThisWeek),
      caption: "this week",
      dot: null,
      href: "/captures",
    },
    {
      key: "training",
      icon: <TrainingIcon size={ICON_SIZE} />,
      label: "Training",
      value: trainingPlanned === 0 ? "—" : String(trainingDone),
      unit: trainingPlanned === 0 ? undefined : `/${trainingPlanned}`,
      caption:
        trainingPlanned === 0
          ? "rest day"
          : trainingDone === trainingPlanned
            ? "complete"
            : `${trainingPlanned - trainingDone} left`,
      dot:
        trainingPlanned === 0
          ? null
          : trainingDone === trainingPlanned
            ? "active"
            : "synced",
      href: "/training",
    },
    {
      key: "projects",
      icon: <AreaIcon size={DIAMOND_ICON_SIZE} />,
      label: "Projects",
      value: String(projectsActive),
      caption: "active",
      dot: null,
      href: "/areas",
    },
    {
      key: "jarvis",
      icon: <InsightIcon size={ICON_SIZE} />,
      label: "Jarvis turns",
      value: String(jarvisTurns),
      caption: "logged",
      dot: null,
      href: "/insights?tab=life",
    },
  ];

  const headerAnim = reduced
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 4 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.16, ease: [0.25, 1, 0.5, 1] as const },
      };

  return (
    <section>
      {/* Greeting row — canvas only, no plate (§4). */}
      <motion.div
        className="mb-4 flex items-center justify-between gap-6"
        {...headerAnim}
      >
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
            {format(now, "EEEE · MMMM d, yyyy")}
          </span>
          <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.01em] text-[var(--sd-ink)]">
            {greeting(now.getHours())}
            {firstName ? `, ${firstName}` : ""}
            <span className="text-[var(--sd-accent)]">.</span>
          </h1>
        </div>

        {/* Presence lamp: JARVIS is here. Not a planet (R1). Soft intensity
            keeps the chrome bob quiet while the landing hero runs bold. */}
        <div className="lifeos-presence flex shrink-0 flex-col items-center gap-1.5">
          <FocalOrb size={ORB_SIZE} intensity="soft" />
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
            JARVIS
          </span>
        </div>
      </motion.div>

      {/* Stat strip — icon-left anatomy, no chrome (§5). */}
      <div className="lifeos-stats mb-5 grid max-w-[1200px] grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
        <style>{STAT_ICON_CSS}</style>
        {stats.map((s, i) => {
          const color = dotColor(s.dot);
          const cellAnim = reduced
            ? { initial: false as const }
            : {
                initial: { opacity: 0, y: 4 },
                animate: { opacity: 1, y: 0 },
                transition: {
                  duration: 0.16,
                  ease: [0.25, 1, 0.5, 1] as const,
                  delay: Math.min(i, 24) * 0.01,
                },
              };
          return (
            <motion.div key={s.key} {...cellAnim}>
              <Link
                href={s.href}
                className="group/stat flex items-center gap-3 rounded-[8px] -mx-2 px-2 py-1.5 outline-none transition-colors duration-150 ease-out hover:bg-[var(--sd-hover)] focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center">
                  {s.icon}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
                    {s.label}
                  </span>
                  <span className="flex items-baseline leading-none">
                    <span className="text-2xl font-black tabular-nums tracking-[-0.01em] text-[var(--sd-ink)]">
                      {s.value}
                    </span>
                    {s.unit ? (
                      <span className="ml-1 text-[16px] font-medium tabular-nums text-[var(--sd-ink-faint)]">
                        {s.unit}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-[12px] text-[var(--sd-ink-dull)]">
                    {color ? (
                      <span
                        aria-hidden
                        className="size-[5px] shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    ) : null}
                    {s.caption}
                  </span>
                </span>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* HabitIcon is a ring, not a filled body: on the dark canvas its indigo band
   sits close enough to the surface that the streak barely reads, while the
   solid siblings carry a lit face. A brightness lift on the dark theme only
   pulls the band clear of the canvas; light keeps the icon exactly as drawn.
   Scoped to this mount so /habits and the sidebar are untouched. */
const STAT_ICON_CSS = `
.dark .lifeos-stats .lifeos-stat-icon--habit { filter: brightness(1.35) saturate(1.08); }
`;
