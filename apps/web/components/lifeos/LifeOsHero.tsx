"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { format } from "date-fns";

interface Stat {
  label: string;
  value: string;
  href: string;
  tone?: "default" | "amber" | "sage" | "cyan" | "coral";
}

interface Props {
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
      value:
        habitsTotal === 0
          ? "—"
          : `${habitsDone}/${habitsTotal}`,
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
      value:
        tasksOverdue > 0
          ? String(tasksOverdue)
          : String(tasksDueToday),
      href: "/tasks",
      tone:
        tasksOverdue > 0
          ? "coral"
          : tasksDueToday > 0
            ? "amber"
            : "sage",
    },
    {
      label: "Training",
      value:
        trainingPlanned === 0
          ? "Rest"
          : `${trainingDone}/${trainingPlanned}`,
      href: "/training",
      tone:
        trainingPlanned === 0
          ? "default"
          : trainingDone === trainingPlanned
            ? "sage"
            : "cyan",
    },
  ];

  const animProps = reduced
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.36, ease: [0.25, 1, 0.5, 1] as const },
      };

  return (
    <motion.section className="mb-10" {...animProps}>
      <div className="flex flex-col gap-5">
        {/* Date strap */}
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
          <span
            aria-hidden
            className="inline-block h-px w-6 bg-[var(--edge)]"
          />
          <span>{format(now, "EEEE · MMMM d, yyyy")}</span>
        </div>

        {/* Greeting + name */}
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-[44px] leading-[1.05] font-semibold tracking-tight text-[var(--ink)]">
            {greeting(now.getHours())}
            {firstName ? (
              <>
                ,{" "}
                <span
                  style={{
                    color: "var(--hud-cyan)",
                    textShadow:
                      "0 0 18px color-mix(in oklch, var(--hud-cyan) 25%, transparent)",
                  }}
                >
                  {firstName}
                </span>
              </>
            ) : null}
            <span className="text-[var(--ink-muted)]">.</span>
          </h1>
          <p className="font-serif italic text-[14px] text-[var(--ink-muted)]">
            One canvas — captures, habits, tasks, training. JARVIS is one tab away.
          </p>
        </div>

        {/* Stat chips */}
        <div className="flex flex-wrap items-stretch gap-2">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className="group/chip inline-flex items-center gap-2.5 rounded-md border border-[var(--edge)] bg-[var(--surface-raised)] px-3 py-1.5 transition-[border-color,transform,background-color] duration-150 ease-out hover:border-[var(--edge-hud)] hover:-translate-y-px"
            >
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                style={{
                  backgroundColor: toneColor(s.tone),
                  boxShadow:
                    s.tone && s.tone !== "default"
                      ? `0 0 8px color-mix(in oklch, ${toneColor(s.tone)} 45%, transparent)`
                      : undefined,
                }}
              />
              <span
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-muted)]"
              >
                {s.label}
              </span>
              <span
                className="font-serif text-[13px] tabular-nums"
                style={{ color: toneColor(s.tone) }}
              >
                {s.value}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
