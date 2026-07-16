"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createSeries } from "@/app/actions/training";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TypeWithBatch } from "@/lib/db/queries/training";
import { displayToKm, type DistanceUnit } from "@/lib/training/distance";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: TypeWithBatch[];
  distanceUnit: DistanceUnit;
  /** Defaults the start date — usually the ISO of the day the user clicked from. */
  defaultStartDate: string;
}

// Display order Mon→Sun while storage stays Sun=0 (matches habits).
const DISPLAY_ORDER: { idx: number; short: string; full: string }[] = [
  { idx: 1, short: "M", full: "Monday" },
  { idx: 2, short: "T", full: "Tuesday" },
  { idx: 3, short: "W", full: "Wednesday" },
  { idx: 4, short: "T", full: "Thursday" },
  { idx: 5, short: "F", full: "Friday" },
  { idx: 6, short: "S", full: "Saturday" },
  { idx: 0, short: "S", full: "Sunday" },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Recurring activity composer — pick days of week, a date range, and the
 * standard activity fields. On save, server materializes one row per
 * matching day in the range.
 */
export function CreateRecurringDialog({
  open,
  onOpenChange,
  types,
  distanceUnit,
  defaultStartDate,
}: Props) {
  const [typeId, setTypeId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [days, setDays] = useState<boolean[]>([
    false, true, true, true, true, true, false,
  ]); // Mon-Fri default
  const [startDate, setStartDate] = useState(defaultStartDate || todayISO());
  const [endDate, setEndDate] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const grouped = (() => {
    const m = new Map<string, TypeWithBatch[]>();
    for (const t of types) {
      const key = t.batchName ?? "Ungrouped";
      const arr = m.get(key);
      if (arr) arr.push(t);
      else m.set(key, [t]);
    }
    return Array.from(m.entries());
  })();

  const selectedType = types.find((t) => t.id === typeId) ?? null;
  const showDistance = !!selectedType?.hasDistance;

  useEffect(() => {
    if (!open) return;
    setTypeId(types[0]?.id ?? "");
    setTitle("");
    setDuration("");
    setDistance("");
    setDays([false, true, true, true, true, true, false]);
    setStartDate(defaultStartDate || todayISO());
    setEndDate("");
  }, [open, defaultStartDate, types]);

  function toggleDay(idx: number) {
    setDays((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  }

  const anyDay = days.some(Boolean);
  const validRange = !endDate || endDate >= startDate;
  const canSubmit =
    !!typeId && !!title.trim() && anyDay && validRange && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    const plannedDurationMin = duration
      ? Number.parseInt(duration, 10)
      : null;
    const plannedDistanceKm =
      showDistance && distance
        ? displayToKm(Number.parseFloat(distance), distanceUnit)
        : null;
    const res = await createSeries({
      activityTypeId: typeId,
      title: title.trim(),
      plannedDurationMin: Number.isFinite(plannedDurationMin)
        ? plannedDurationMin
        : null,
      plannedDistanceKm:
        plannedDistanceKm != null && Number.isFinite(plannedDistanceKm)
          ? plannedDistanceKm
          : null,
      daysOfWeek: days,
      startDate,
      endDate: endDate || null,
    });
    setSaving(false);
    if (!res.success) {
      toast.error(res.error || "Could not create series");
      return;
    }
    toast.success(`Created ${res.data.createdCount} occurrences`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Recurring activity</DialogTitle>
          <DialogDescription>
            Repeats on the days you pick, from start to end date. End date
            optional — defaults to one year out.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Type */}
          <Field label="Type">
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Pick a type" />
              </SelectTrigger>
              <SelectContent>
                {grouped.map(([groupName, list]) => (
                  <SelectGroup key={groupName}>
                    <SelectLabel>{groupName}</SelectLabel>
                    {list.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden
                            className="h-2 w-2 rounded-sm"
                            style={{ backgroundColor: t.color }}
                          />
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* Title */}
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Morning run, Bench day…"
              className="h-9"
            />
          </Field>

          {/* Duration + distance */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (min)">
              <Input
                value={duration}
                onChange={(e) => setDuration(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="45"
                inputMode="numeric"
                className="h-9"
              />
            </Field>
            {showDistance ? (
              <Field label={`Distance (${distanceUnit})`}>
                <Input
                  value={distance}
                  onChange={(e) =>
                    setDistance(e.target.value.replace(/[^\d.]/g, ""))
                  }
                  placeholder="5.0"
                  inputMode="decimal"
                  className="h-9"
                />
              </Field>
            ) : (
              <div />
            )}
          </div>

          {/* Days of week */}
          <Field label="Repeats on">
            <div role="group" className="inline-flex items-center gap-1">
              {DISPLAY_ORDER.map(({ idx, short, full }) => {
                const on = !!days[idx];
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    aria-pressed={on}
                    aria-label={full}
                    title={full}
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-md border font-mono text-[11px] uppercase transition-colors",
                      on
                        ? "border-[var(--sd-ink)] bg-[var(--sd-box)] text-[var(--sd-ink)]"
                        : "border-[var(--sd-line)] bg-[var(--sd-input)] text-[var(--sd-ink-dull)] hover:border-[var(--sd-accent)] hover:text-[var(--sd-ink)]",
                    )}
                  >
                    {short}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9"
              />
            </Field>
            <Field label="End (optional)">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="h-9"
              />
            </Field>
          </div>
          {!validRange ? (
            <p className="text-xs text-red-500">
              End date must be on or after start date.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {saving ? "Creating…" : "Create series"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-dull)]">
        {label}
      </div>
      {children}
    </div>
  );
}
