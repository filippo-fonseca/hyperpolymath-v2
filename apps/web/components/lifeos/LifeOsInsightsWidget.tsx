"use client";

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
      <header className="mb-4 flex items-center justify-between">
        <h3 className="font-serif text-base font-semibold text-[var(--ink)]">Insights</h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
          Open →
        </span>
      </header>
      <dl className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1">
            <dd className="font-mono text-2xl tabular-nums text-[var(--ink)]">{s.value}</dd>
            <dt className="font-serif text-[12px] text-[var(--ink-muted)]">{s.label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}
