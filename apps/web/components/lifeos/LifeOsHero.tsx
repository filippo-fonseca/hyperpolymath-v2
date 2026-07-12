"use client";

import { KpiRail, StatChip } from "@/components/spacedrive";
import { format } from "date-fns";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

interface Stat {
  label: string;
  value: string;
  href: string;
  tone?: "default" | "amber" | "sage" | "cyan" | "coral";
}

interface Props {
  titleId?: string;
  displayName?: string | null;
  habitsDone: number;
  habitsTotal: number;
  tasksDueToday: number;
  tasksOverdue: number;
  trainingPlanned: number;
  trainingDone: number;
}

function greeting(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Burning late";
}

function toneColor(tone: Stat["tone"]) {
  switch (tone) {
    case "amber":
      return "var(--ink-amber)";
    case "sage":
      return "var(--ink-sage)";
    case "cyan":
      return "var(--hud-cyan)";
    case "coral":
      return "var(--ink-coral)";
    default:
      return "var(--ink)";
  }
}

/**
 * LifeOsHero — the page header for /lifeos.
 *
 * Three rows: a faint date strap, a serif greeting + first name, and a row of
 * stat chips that link into the surfaces they summarise. Tones map to status:
 * coral = something is overdue, amber = something is due, sage = all-clear,
 * cyan = highlight. Restraint: no glow, no big numbers, no neumorphic.
 */
export function LifeOsHero({
  titleId = "lifeos-title",
  displayName,
  habitsDone,
  habitsTotal,
  tasksDueToday,
  tasksOverdue,
  trainingPlanned,
  trainingDone,
}: Props) {
  const reduced = useReducedMotion();
  const now = new Date();
  const firstName = displayName?.trim().split(/\s+/)[0] ?? "";

  const stats: Stat[] = [
    {
      label: "Habits",
      value: habitsTotal === 0 ? "—" : `${habitsDone}/${habitsTotal}`,
      href: "/habits",
      tone:
        habitsTotal > 0 && habitsDone === habitsTotal
          ? "sage"
          : habitsDone > 0
            ? "cyan"
            : "default",
    },
    {
      label: tasksOverdue > 0 ? "Overdue" : "Due today",
      value: tasksOverdue > 0 ? String(tasksOverdue) : String(tasksDueToday),
      href: "/tasks",
      tone: tasksOverdue > 0 ? "coral" : tasksDueToday > 0 ? "amber" : "sage",
    },
    {
      label: "Training",
      value: trainingPlanned === 0 ? "Rest" : `${trainingDone}/${trainingPlanned}`,
      href: "/training",
      tone: trainingPlanned === 0 ? "default" : trainingDone === trainingPlanned ? "sage" : "cyan",
    },
  ];

  const animProps = reduced
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.36, ease: [0.25, 1, 0.5, 1] as const },
      };

  const taskSummary =
    tasksOverdue > 0
      ? `${tasksOverdue} overdue task${tasksOverdue === 1 ? "" : "s"} need attention.`
      : tasksDueToday > 0
        ? `${tasksDueToday} task${tasksDueToday === 1 ? "" : "s"} due today.`
        : "Your queue is clear for today.";

  return (
    <motion.section className="mb-7" {...animProps}>
      <div className="flex flex-col gap-5">
        {/* Date strap */}
        <div className="flex flex-wrap items-center gap-3 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-[var(--deck-ink-dull)]">
          <span aria-hidden className="inline-block h-px w-6 bg-[var(--edge)]" />
          <span>{format(now, "EEEE · MMMM d, yyyy")}</span>
          <span className="text-[var(--deck-ink-faint)]">/ COMMAND DECK</span>
        </div>

        {/* Greeting + name */}
        <div className="flex flex-col gap-2">
          <h1
            id={titleId}
            className="font-[family-name:var(--font-sans)] text-[clamp(2rem,5vw,3.25rem)] leading-[1.05] font-semibold tracking-[-0.04em] text-[var(--deck-ink)]"
          >
            {greeting(now.getHours())}
            {firstName ? (
              <>
                , <span className="text-[var(--deck-accent)]">{firstName}</span>
              </>
            ) : null}
            <span className="text-[var(--deck-ink-dull)]">.</span>
          </h1>
          <p className="max-w-2xl font-[family-name:var(--font-sans)] text-[13px] leading-5 text-[var(--deck-ink-dull)]">
            {taskSummary} Habits, training, and captures are staged below.
          </p>
        </div>

        {/* KPI rail — links remain native navigation targets. */}
        <KpiRail className="gap-x-5 gap-y-3 sm:gap-x-8">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              aria-label={`${s.label}: ${s.value}`}
              className="group/kpi rounded-md px-1 py-1 transition-colors [transition-duration:var(--dur-hover)] hover:bg-[var(--deck-hover)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            >
              <StatChip
                label={s.label}
                value={<span style={{ color: toneColor(s.tone) }}>{s.value}</span>}
              />
            </Link>
          ))}
        </KpiRail>
      </div>
    </motion.section>
  );
}
