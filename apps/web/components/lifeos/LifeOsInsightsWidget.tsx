"use client";

import { HabitIcon, InsightIcon, TrainingIcon } from "@/components/ui/icons";
import { ActionLink, Chip, EntityCardHeader, StatusPill } from "./entity-card";
import { WidgetBody, WidgetFooter } from "./WidgetCard";

interface Props {
  jarvisTurns: number;
  habitsDone: number;
  habitsTotal: number;
  trainingDone: number;
  trainingPlanned: number;
}

/**
 * LifeOsInsightsWidget — the compact gateway cell (SD3 §2) that folds into the
 * widget deck and links into the Insights "Life" tab.
 *
 * As a compact 3-col cell it can't afford the old three-stat strip, so it leads
 * with a single headline metric (JARVIS turns, the register's pulse) plus a
 * one-line week summary; the habits/training splits live in the §11 footer chip
 * strip. Headline metrics + chip strip, one screen.
 */
export function LifeOsInsightsWidget({
  jarvisTurns,
  habitsDone,
  habitsTotal,
  trainingDone,
  trainingPlanned,
}: Props) {
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
        <div className="mt-3 flex min-h-0 flex-1 flex-col justify-center">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[34px] font-black leading-none tracking-[-0.02em] tabular-nums text-[var(--sd-ink)]">
              {jarvisTurns}
            </span>
            <span className="text-[13px] font-medium text-[var(--sd-ink-dull)]">
              JARVIS turns · 7d
            </span>
          </div>
          <p className="mt-2 flex items-center gap-2 text-[12px] text-[var(--sd-ink-dull)]">
            <HabitIcon size={16} aria-hidden />
            <span className="tabular-nums">
              {habitsDone}/{habitsTotal} habits
            </span>
            <span aria-hidden className="text-[var(--sd-ink-faint)]">
              ·
            </span>
            <TrainingIcon size={16} aria-hidden />
            <span className="tabular-nums">
              {trainingDone}/{trainingPlanned} training
            </span>
          </p>
        </div>
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
