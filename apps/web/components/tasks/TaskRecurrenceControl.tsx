"use client";

import { Input } from "@/components/ui/input";
import type { RecurrenceFrequency, RecurrenceRule } from "@/lib/tasks/recurrence";
import { describeRule, normalizeRule } from "@/lib/tasks/recurrence";
import { cn } from "@/lib/utils";
import { Repeat } from "lucide-react";

/**
 * Recurrence editor for a task (issue #144). DISTINCT from the habit frequency
 * selector: this controls a self-rescheduling to-do, not a tracked habit-loop,
 * so it uses the CYAN accent (habits = amber) and frames choices as "repeat
 * every …" rather than a weekly grid with streak semantics.
 *
 * Controlled: parent owns `value` (null = one-off). The control never mutates
 * the DB itself; it just emits the next rule (or null to stop repeating).
 */

interface Props {
  value: RecurrenceRule | null;
  onChange: (next: RecurrenceRule | null) => void;
  disabled?: boolean;
}

const FREQ_OPTIONS: { value: RecurrenceFrequency | "none"; label: string }[] = [
  { value: "none", label: "Doesn't repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Every N days" },
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

export function TaskRecurrenceControl({ value, onChange, disabled = false }: Props) {
  const frequency: RecurrenceFrequency | "none" = value?.frequency ?? "none";

  function pickFrequency(next: RecurrenceFrequency | "none") {
    if (disabled) return;
    if (next === "none") {
      onChange(null);
      return;
    }
    if (next === "weekly") {
      onChange(
        normalizeRule({
          frequency: "weekly",
          interval: value?.interval ?? 1,
          // Seed with the current weekdays, else Monday so the rule is valid.
          weekdays: value?.weekdays && value.weekdays.length > 0 ? value.weekdays : [1],
        })
      );
      return;
    }
    onChange(
      normalizeRule({
        frequency: next,
        interval: next === "custom" ? Math.max(2, value?.interval ?? 2) : 1,
      })
    );
  }

  function setInterval(n: number) {
    if (!value || disabled) return;
    onChange(normalizeRule({ ...value, interval: n }));
  }

  function toggleWeekday(idx: number) {
    if (!value || value.frequency !== "weekly" || disabled) return;
    const current = new Set(value.weekdays ?? []);
    if (current.has(idx)) current.delete(idx);
    else current.add(idx);
    // Never allow an empty weekly rule — keep at least one day.
    const nextDays = Array.from(current);
    if (nextDays.length === 0) return;
    onChange(normalizeRule({ ...value, weekdays: nextDays }));
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Frequency pills — cyan accent marks "this is a recurring task". */}
      <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0" aria-label="Repeat">
        {FREQ_OPTIONS.map((opt) => {
          const selected = opt.value === frequency;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => pickFrequency(opt.value)}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 py-1 cursor-pointer-always",
                "font-mono text-[11px] uppercase tracking-[0.08em] backdrop-blur-md",
                "border transition-[color,background-color,border-color,box-shadow] duration-[var(--dur-hover)] ease-out focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
                selected
                  ? "border-[var(--hud-cyan)] text-[var(--ink)]"
                  : "border-[var(--edge)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge-hud)]",
                disabled && "opacity-40 cursor-not-allowed"
              )}
              style={
                selected
                  ? {
                      backgroundColor: "color-mix(in oklch, var(--hud-cyan) 14%, transparent)",
                      boxShadow:
                        "inset 0 0 0 1px color-mix(in oklch, var(--hud-cyan) 45%, transparent), 0 0 12px color-mix(in oklch, var(--hud-cyan) 22%, transparent)",
                    }
                  : undefined
              }
            >
              {opt.value !== "none" && <Repeat size={11} strokeWidth={2} />}
              {opt.label}
            </button>
          );
        })}
      </fieldset>

      {/* Custom interval — "every N days". */}
      {value?.frequency === "custom" && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-[var(--ink-muted)]">Every</span>
          <Input
            type="number"
            min={1}
            max={365}
            value={value.interval}
            onChange={(e) => setInterval(Number.parseInt(e.target.value, 10) || 1)}
            disabled={disabled}
            className="font-mono text-[13px] h-8 w-20"
            aria-label="Interval in days"
          />
          <span className="font-mono text-[11px] text-[var(--ink-muted)]">days</span>
        </div>
      )}

      {/* Weekly weekday picker — cyan-accented to stay distinct from habits. */}
      {value?.frequency === "weekly" && (
        <div className="flex flex-col gap-2">
          <fieldset
            className="m-0 inline-flex items-center gap-1 border-0 p-0"
            aria-label="Repeat on"
          >
            {WEEKDAY_ORDER.map(({ idx, short, full }) => {
              const on = (value.weekdays ?? []).includes(idx);
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
                    "inline-flex h-8 w-8 items-center justify-center rounded-md",
                    "font-mono text-[11px] uppercase tracking-[0.04em] cursor-pointer-always",
                    "border transition-colors duration-[var(--dur-hover)] ease-out focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
                    on
                      ? "border-[var(--hud-cyan)] bg-[color-mix(in_oklch,var(--hud-cyan)_14%,var(--surface))] text-[var(--ink)]"
                      : "border-[var(--edge)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge-hud)]",
                    disabled && "opacity-40 cursor-not-allowed"
                  )}
                >
                  {short}
                </button>
              );
            })}
          </fieldset>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-[var(--ink-muted)]">Every</span>
            <Input
              type="number"
              min={1}
              max={52}
              value={value.interval}
              onChange={(e) => setInterval(Number.parseInt(e.target.value, 10) || 1)}
              disabled={disabled}
              className="font-mono text-[13px] h-8 w-20"
              aria-label="Interval in weeks"
            />
            <span className="font-mono text-[11px] text-[var(--ink-muted)]">
              {value.interval === 1 ? "week" : "weeks"}
            </span>
          </div>
        </div>
      )}

      {/* Live summary of the rule. */}
      {value && (
        <p className="font-mono text-[11px] text-[var(--hud-cyan)]">
          {describeRule(value)}. Advances to the next date when completed.
        </p>
      )}
    </div>
  );
}
