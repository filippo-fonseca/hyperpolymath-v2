"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RecurrencePreset, RecurrenceRule } from "@/lib/tasks/recurrence";
import { describeRule, normalizeRule, presetForRule, ruleForPreset } from "@/lib/tasks/recurrence";
import { cn } from "@/lib/utils";

/**
 * Recurrence editor for a task (issue #144). DISTINCT from the habit frequency
 * selector: this controls a self-rescheduling to-do, not a tracked habit-loop,
 * so it stays on the neutral selected-state grammar (no hue) and frames choices
 * as "repeat every …" rather than a weekly grid with streak semantics.
 *
 * aug-07: the old four-pill row (Doesn't repeat / Daily / Weekly / Every N
 * days) could express "every weekday" only by hand-toggling five pills, and
 * only after first choosing Weekly. It is now a Google-Calendar-shaped menu of
 * named presets, with the weekday pills and the interval revealed by the
 * choices that actually need them. The presets are just names for rules the
 * engine already supported, so nothing changed in storage.
 *
 * Controlled: parent owns `value` (null = one-off). The control never mutates
 * the DB itself; it just emits the next rule (or null to stop repeating).
 */

interface Props {
  value: RecurrenceRule | null;
  onChange: (next: RecurrenceRule | null) => void;
  disabled?: boolean;
  /**
   * The task's due-date weekday (0 = Sunday), so "Weekly" means "weekly on the
   * day this is due" rather than always seeding Monday. Defaults to today's.
   */
  anchorWeekday?: number;
}

const PRESET_LABELS: Record<RecurrencePreset, string> = {
  none: "Doesn't repeat",
  daily: "Daily",
  weekly: "Weekly",
  weekdays: "Every weekday (Mon–Fri)",
  weekends: "Every weekend day (Sat, Sun)",
  "every-n-days": "Every N days",
  custom: "Custom…",
};

const PRESET_ORDER: RecurrencePreset[] = [
  "none",
  "daily",
  "weekly",
  "weekdays",
  "weekends",
  "every-n-days",
  "custom",
];

// Weekday pills in Mon→Sun display order; storage stays Sun=0 (Date.getDay()).
const WEEKDAY_ORDER: { idx: number; short: string; full: string }[] = [
  { idx: 1, short: "M", full: "Monday" },
  { idx: 2, short: "T", full: "Tuesday" },
  { idx: 3, short: "W", full: "Wednesday" },
  { idx: 4, short: "T", full: "Thursday" },
  { idx: 5, short: "F", full: "Friday" },
  { idx: 6, short: "S", full: "Saturday" },
  { idx: 0, short: "S", full: "Sunday" },
];

export function TaskRecurrenceControl({ value, onChange, disabled = false, anchorWeekday }: Props) {
  const anchor = anchorWeekday ?? new Date().getDay();
  const preset = presetForRule(value, anchor);

  // The pills and the week interval belong to the two presets that are ABOUT
  // choosing days. Showing them under "Daily" would be noise; hiding them under
  // the named weekday/weekend presets would make those presets a dead end, so
  // those stay visible and editing them slides the menu to Custom on its own.
  const showWeekdayPills =
    preset === "weekly" || preset === "weekdays" || preset === "weekends" || preset === "custom";
  const showDayInterval = preset === "every-n-days";
  const showWeekInterval = preset === "custom";

  function pickPreset(next: RecurrencePreset) {
    if (disabled) return;
    onChange(ruleForPreset(next, { anchorWeekday: anchor, previous: value }));
  }

  function setInterval(n: number) {
    if (!value || disabled) return;
    onChange(normalizeRule({ ...value, interval: n }));
  }

  function toggleWeekday(idx: number) {
    if (!value || disabled) return;
    // Any pill edit means a weekly rule, even if we arrived here from a preset
    // that happened to be expressed as one.
    const base = value.frequency === "weekly" ? value : { ...value, frequency: "weekly" as const };
    const current = new Set(base.weekdays ?? [anchor]);
    if (current.has(idx)) current.delete(idx);
    else current.add(idx);
    // A weekly rule with no days would never fire; keep the last one.
    if (current.size === 0) return;
    onChange(normalizeRule({ ...base, weekdays: Array.from(current) }));
  }

  const selectedDays = new Set(value?.weekdays ?? []);

  return (
    <div className="flex flex-col gap-3">
      <Select
        value={preset}
        onValueChange={(next) => pickPreset(next as RecurrencePreset)}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 w-full text-meta" aria-label="Repeat">
          <SelectValue placeholder="Doesn't repeat" />
        </SelectTrigger>
        <SelectContent>
          {PRESET_ORDER.map((p) => (
            <SelectItem key={p} value={p} className="text-meta">
              {PRESET_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {showDayInterval ? (
        <div className="flex items-center gap-2">
          <span className="text-meta text-[var(--ink-muted)]">Every</span>
          <Input
            type="number"
            min={1}
            max={365}
            value={value?.interval ?? 2}
            onChange={(e) => setInterval(Number.parseInt(e.target.value, 10) || 1)}
            disabled={disabled}
            className="h-8 w-20 font-mono text-meta tabular-nums"
            aria-label="Interval in days"
          />
          <span className="text-meta text-[var(--ink-muted)]">days</span>
        </div>
      ) : null}

      {showWeekdayPills ? (
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-1" role="group" aria-label="Repeat on">
            {WEEKDAY_ORDER.map(({ idx, short, full }) => {
              const on = selectedDays.has(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleWeekday(idx)}
                  disabled={disabled}
                  aria-pressed={on}
                  aria-label={full}
                  title={full}
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-full",
                    "text-micro cursor-pointer-always",
                    "border transition-colors duration-[160ms] ease-out",
                    on
                      ? "border-[var(--edge-strong)] bg-[var(--selected)] text-[var(--ink)]"
                      : "border-[var(--edge)] bg-[var(--surface)] text-[var(--ink-muted)] hover:border-[var(--edge-strong)] hover:text-[var(--ink)]",
                    disabled && "cursor-not-allowed opacity-40"
                  )}
                >
                  {short}
                </button>
              );
            })}
          </div>

          {showWeekInterval ? (
            <div className="flex items-center gap-2">
              <span className="text-meta text-[var(--ink-muted)]">Every</span>
              <Input
                type="number"
                min={1}
                max={52}
                value={value?.interval ?? 1}
                onChange={(e) => setInterval(Number.parseInt(e.target.value, 10) || 1)}
                disabled={disabled}
                className="h-8 w-20 font-mono text-meta tabular-nums"
                aria-label="Interval in weeks"
              />
              <span className="text-meta text-[var(--ink-muted)]">
                {(value?.interval ?? 1) === 1 ? "week" : "weeks"}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {value ? (
        <p className="text-micro text-[var(--ink-muted)]">
          {describeRule(value)}. Advances to the next date when completed.
        </p>
      ) : null}
    </div>
  );
}
