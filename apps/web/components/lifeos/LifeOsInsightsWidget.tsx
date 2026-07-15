"use client";

import type { ReactNode } from "react";
import { HabitIcon, InsightIcon, TrainingIcon } from "@/components/ui/icons";
import { ActionLink, Chip, EntityCardHeader, StatusPill } from "./entity-card";
import { WidgetBody, WidgetFooter } from "./WidgetCard";

interface Stat {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
}

interface Props {
  jarvisTurns: number;
  habitsDone: number;
  habitsTotal: number;
  trainingDone: number;
  trainingPlanned: number;
}

/**
 * LifeOsInsightsWidget — the full-width gateway tile that summarizes the week and
 * links into the Insights "Life" tab.
 *
 * §6 gives this card a stat-strip-style mini row: each stat is the §5 anatomy at
 * reduced scale (dimensional icon left, uppercase micro-label, then a bold
 * tabular value with its suffix riding the same baseline).
 */
export function LifeOsInsightsWidget({
  jarvisTurns,
  habitsDone,
  habitsTotal,
  trainingDone,
  trainingPlanned,
}: Props) {
  const stats: Stat[] = [
    {
      icon: <InsightIcon size={32} />,
      label: "JARVIS turns",
      value: String(jarvisTurns),
      unit: "7d",
    },
    {
      icon: <HabitIcon size={32} />,
      label: "Habits today",
      value: String(habitsDone),
      unit: `/ ${habitsTotal}`,
    },
    {
      icon: <TrainingIcon size={32} />,
      label: "Training today",
      value: String(trainingDone),
      unit: `/ ${trainingPlanned}`,
    },
  ];

  return (
    <>
      <WidgetBody>
        <EntityCardHeader
          icon={<InsightIcon size={36} />}
          title="Insights"
          subtitle="This week"
          pill={
            jarvisTurns > 0 ? (
              <StatusPill tone="progress" label="7d" />
            ) : (
              <StatusPill tone="idle" label="quiet" />
            )
          }
          action={<ActionLink>Open →</ActionLink>}
        />
        <dl className="mt-4 grid grid-cols-1 gap-5 @lg/main:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span aria-hidden className="inline-flex shrink-0">
                {s.icon}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
                  {s.label}
                </dt>
                <dd className="flex items-baseline gap-1">
                  <span className="text-[22px] font-bold leading-none tracking-[-0.01em] tabular-nums text-[var(--sd-ink)]">
                    {s.value}
                  </span>
                  {s.unit != null && (
                    <span className="text-[13px] font-medium text-[var(--sd-ink-dull)]">
                      {s.unit}
                    </span>
                  )}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </WidgetBody>

      <WidgetFooter>
        <Chip>Trailing 7 days</Chip>
        {jarvisTurns > 0 && <Chip>{jarvisTurns} turns</Chip>}
        {habitsTotal > 0 && (
          <Chip>
            {habitsDone}/{habitsTotal} habits
          </Chip>
        )}
        {trainingPlanned > 0 && (
          <Chip>
            {trainingDone}/{trainingPlanned} sessions
          </Chip>
        )}
      </WidgetFooter>
    </>
  );
}
