"use client";

import { HabitIcon, InsightIcon, TrainingIcon } from "@/components/ui/icons";
import { ActionLink, EntityCardHeader } from "./entity-card";
import { WidgetBody } from "./WidgetCard";

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
 * one-line micro summary of the habits/training splits. No pill, no footer —
 * everything the cell knows fits in those two lines (aug-05 quiet pass).
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
          icon={<InsightIcon size={20} />}
          title="Insights"
          subtitle="This week"
          // aug-05 quiet pass: no pill, no footer — the headline metric and
          // the mini-stat line below already say everything this cell knows.
          action={<ActionLink>Open →</ActionLink>}
        />
        <div className="mt-3 flex min-h-0 flex-1 flex-col justify-center">
          <div className="flex items-baseline gap-2">
            <span className="text-title font-semibold leading-none tabular-nums text-[var(--sd-ink)]">
              {jarvisTurns}
            </span>
            <span className="text-micro font-normal text-[var(--sd-ink-faint)]">
              JARVIS turns · 7d
            </span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-micro text-[var(--sd-ink-faint)]">
            <HabitIcon size={14} aria-hidden />
            <span className="tabular-nums">
              {habitsDone}/{habitsTotal} habits
            </span>
            <span aria-hidden>·</span>
            <TrainingIcon size={14} aria-hidden />
            <span className="tabular-nums">
              {trainingDone}/{trainingPlanned} training
            </span>
          </p>
        </div>
      </WidgetBody>
    </>
  );
}
