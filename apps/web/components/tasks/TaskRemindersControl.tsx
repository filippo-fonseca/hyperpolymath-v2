"use client";

import { Bell, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  describeReminder,
  newReminderId,
  type ReminderUnit,
  type TaskReminder,
} from "@/lib/tasks/reminders";

interface Props {
  value: TaskReminder[] | null;
  onChange: (next: TaskReminder[] | null) => void;
  disabled?: boolean;
  /** When false, show a hint that reminders need a due date. */
  hasDueDate?: boolean;
}

const UNITS: { value: ReminderUnit; label: string }[] = [
  { value: "minutes", label: "min" },
  { value: "hours", label: "hrs" },
  { value: "days", label: "days" },
  { value: "weeks", label: "wks" },
];

const PRESETS: { amount: number; unit: ReminderUnit; label: string }[] = [
  { amount: 15, unit: "minutes", label: "15m" },
  { amount: 1, unit: "hours", label: "1h" },
  { amount: 1, unit: "days", label: "1d" },
  { amount: 1, unit: "weeks", label: "1w" },
];

export function TaskRemindersControl({
  value,
  onChange,
  disabled = false,
  hasDueDate = true,
}: Props) {
  const list = value ?? [];

  function emit(next: TaskReminder[]) {
    onChange(next.length > 0 ? next : null);
  }

  function addReminder(amount = 1, unit: ReminderUnit = "hours") {
    if (disabled) return;
    emit([...list, { id: newReminderId(), amount, unit }]);
  }

  function update(id: string, patch: Partial<TaskReminder>) {
    if (disabled) return;
    emit(list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function remove(id: string) {
    if (disabled) return;
    emit(list.filter((r) => r.id !== id));
  }

  return (
    <div className="flex flex-col gap-2.5">
      {!hasDueDate && (
        <p className="font-sans text-[11px] text-[var(--sd-ink-faint)]">
          Set a due date to schedule reminders.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            disabled={disabled || !hasDueDate}
            onClick={() => addReminder(p.amount, p.unit)}
            className={cn(
              "inline-flex items-center rounded-[6px] border border-[var(--sd-line)] px-2 py-0.5",
              "font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--sd-ink-muted)]",
              "hover:border-[var(--sd-accent)] hover:text-[var(--sd-accent)]",
              "transition-colors duration-[120ms] ease-out cursor-pointer-always",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            + {p.label}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled || !hasDueDate}
          onClick={() => addReminder(30, "minutes")}
          className={cn(
            "inline-flex items-center gap-1 rounded-[6px] border border-[var(--sd-line)] px-2 py-0.5",
            "font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--sd-ink-muted)]",
            "hover:border-[var(--sd-accent)] hover:text-[var(--sd-accent)]",
            "transition-colors duration-[120ms] ease-out cursor-pointer-always",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          <Plus size={10} strokeWidth={1.75} />
          Custom
        </button>
      </div>

      {list.length === 0 ? (
        <p className="inline-flex items-center gap-1.5 font-sans text-[12px] text-[var(--sd-ink-faint)]">
          <Bell size={12} strokeWidth={1.5} />
          No reminders
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-1.5 rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-input)] px-2 py-1.5"
            >
              <Input
                type="number"
                min={1}
                max={100000}
                value={r.amount}
                disabled={disabled}
                onChange={(e) =>
                  update(r.id, {
                    amount: Math.max(1, Number.parseInt(e.target.value || "1", 10) || 1),
                  })
                }
                className="h-7 w-16 font-mono text-[12px]"
                aria-label="Reminder amount"
              />
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Reminder unit">
                {UNITS.map((u) => {
                  const selected = r.unit === u.value;
                  return (
                    <button
                      key={u.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      onClick={() => update(r.id, { unit: u.value })}
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
                        "border transition-colors duration-[120ms] cursor-pointer-always",
                        selected
                          ? "border-[var(--sd-accent)] text-[var(--sd-accent)]"
                          : "border-transparent text-[var(--sd-ink-muted)] hover:text-[var(--sd-ink)]",
                        disabled && "opacity-40 cursor-not-allowed",
                      )}
                    >
                      {u.label}
                    </button>
                  );
                })}
              </div>
              <span className="ml-auto hidden font-sans text-[11px] text-[var(--sd-ink-faint)] sm:inline">
                {describeReminder(r)}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(r.id)}
                aria-label="Remove reminder"
                className="cursor-pointer-always rounded p-0.5 text-[var(--sd-ink-faint)] hover:text-[var(--ink-coral)] disabled:opacity-40"
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
