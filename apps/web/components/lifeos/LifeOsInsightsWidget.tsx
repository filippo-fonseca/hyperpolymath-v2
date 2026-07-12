"use client";

import { HairlineDivider, SectionHeader } from "@/components/spacedrive";

interface Stat {
  label: string;
  value: string;
}

interface Props {
  jarvisTurns: number;
  habitsDone: number;
  habitsTotal: number;
  trainingDone: number;
  trainingPlanned: number;
}

/**
 * LifeOsInsightsWidget — a slim gateway tile that summarizes the week and
 * links into the Insights "Life" tab. Rendered inside a WidgetCard whose
 * margin-click overlay routes to /insights?tab=life.
 */
export function LifeOsInsightsWidget({
  jarvisTurns,
  habitsDone,
  habitsTotal,
  trainingDone,
  trainingPlanned,
}: Props) {
  const stats: Stat[] = [
    { label: "JARVIS turns · 7d", value: String(jarvisTurns) },
    { label: "Habits today", value: `${habitsDone}/${habitsTotal}` },
    { label: "Training today", value: `${trainingDone}/${trainingPlanned}` },
  ];

  return (
    <div className="flex h-full flex-col">
      <SectionHeader
        title="Insights gateway"
        action={
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--deck-ink-dull)]">
            Open →
          </span>
        }
        className="mb-3"
      />
      <HairlineDivider className="mb-4" />
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {stats.map((s) => (
          <div key={s.label} className="flex min-w-0 flex-col gap-1">
            <dd className="font-[family-name:var(--font-sans)] text-xl tabular-nums text-[var(--deck-ink)] sm:text-2xl">
              {s.value}
            </dd>
            <dt className="font-[family-name:var(--font-sans)] text-[12px] text-[var(--deck-ink-dull)]">
              {s.label}
            </dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
