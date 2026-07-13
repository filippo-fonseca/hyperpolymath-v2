"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { format } from "date-fns";
import {
  AreaIcon,
  CaptureIcon,
  HabitIcon,
  InsightIcon,
  TaskIcon,
  TrainingIcon,
} from "@/components/ui/icons";

/**
 * A single dot tone. Functional hues appear ONLY as 6px status dots (D6);
 * numerals themselves stay in `--sd-ink`, never tinted.
 */
type DotTone = "danger" | "warn" | "active" | "synced" | null;

interface Stat {
  key: string;
  icon: ReactNode;
  label: string;
  /** Primary numeral (large, bold, `--sd-ink`). */
  value: string;
  /** Optional muted denominator, e.g. the "/5" in "3/5". */
  secondary?: string;
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

/** 6px functional dot. Reuses the ladder inks (D6); never a raw hex. */
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

const ICON_SIZE = 30;

/**
 * LifeOsHero — the /lifeos page header, rebuilt as the Spacedrive "Overview"
 * stat strip (design constitution §A1, decisions D2).
 *
 * Two registers on one header. The greeting is EB Garamond — the page's one
 * sanctioned editorial accent (D1). Everything below it is strictly the sd
 * register: a row of stats, each a dimensional icon + bold `--sd-ink` numeral
 * + mono uppercase `.sd-stat-label` + one dull caption line, with a 6px
 * functional dot the only splash of colour. No card chrome around the strip
 * (§A1). Each stat links into the surface it summarises; the focus ring is the
 * accent (D6). All numbers derive from props the server already fetched — no
 * new queries (oracle Q2).
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
      icon: <HabitIcon size={ICON_SIZE} />,
      label: "Habits today",
      value: habitsTotal === 0 ? "0" : String(habitsDone),
      secondary: habitsTotal === 0 ? undefined : `/${habitsTotal}`,
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
      secondary: trainingPlanned === 0 ? undefined : `/${trainingPlanned}`,
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
      icon: <AreaIcon size={ICON_SIZE} />,
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
    <section className="flex flex-col gap-6">
      {/* Greeting — the page's one editorial (serif) accent (D1). */}
      <motion.div className="flex flex-col gap-2" {...headerAnim}>
        <div className="flex items-center gap-3">
          <span aria-hidden className="inline-block h-px w-6 bg-[var(--sd-line)]" />
          <span className="sd-stat-label">{format(now, "EEEE · MMMM d, yyyy")}</span>
        </div>
        <h1 className="font-serif text-[40px] leading-[1.05] font-semibold tracking-tight text-[var(--sd-ink)]">
          {greeting(now.getHours())}
          {firstName ? (
            <>
              ,{" "}
              <span
                style={{
                  color: "var(--sd-accent)",
                  textShadow:
                    "0 0 18px color-mix(in oklch, var(--sd-accent) 25%, transparent)",
                }}
              >
                {firstName}
              </span>
            </>
          ) : null}
          <span className="text-[var(--sd-ink-faint)]">.</span>
        </h1>
      </motion.div>

      {/* Stat strip — strictly sd-register, no card chrome (§A1). */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
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
                className="group flex flex-col gap-2 rounded-[8px] px-3 py-2.5 -mx-3 outline-none transition-colors duration-150 ease-out hover:bg-[var(--sd-hover)] focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
              >
                <span className="inline-flex">{s.icon}</span>
                <span className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold leading-none tabular-nums text-[var(--sd-ink)]">
                    {s.value}
                  </span>
                  {s.secondary ? (
                    <span className="text-base font-medium tabular-nums text-[var(--sd-ink-faint)]">
                      {s.secondary}
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="sd-stat-label">{s.label}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-[var(--sd-ink-dull)]">
                    {color ? (
                      <span
                        aria-hidden
                        className="sd-dot"
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
