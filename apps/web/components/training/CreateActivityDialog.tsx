"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createActivity } from "@/app/actions/training";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDateISO: string;
  types: TypeWithBatch[];
  distanceUnit: DistanceUnit;
}

/**
 * Bigger one-off activity composer. Same fields as the inline form had,
 * laid out in a real Dialog. Pressing Enter on the title submits.
 */
export function CreateActivityDialog({
  open,
  onOpenChange,
  defaultDateISO,
  types,
  distanceUnit,
}: Props) {
  const [typeId, setTypeId] = useState<string>(() => types[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDateISO);
  const [duration, setDuration] = useState("");
  const [distance, setDistance] = useState("");
  const [description, setDescription] = useState("");
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
    setDate(defaultDateISO);
    setDuration("");
    setDistance("");
    setDescription("");
  }, [open, defaultDateISO, types]);

  const canSubmit = !!typeId && !!title.trim() && !saving;

  async function handleSubmit(closeAfter: boolean) {
    if (!canSubmit) return;
    const plannedDurationMin = duration
      ? Number.parseInt(duration, 10)
      : null;
    const plannedDistanceKm =
      showDistance && distance
        ? displayToKm(Number.parseFloat(distance), distanceUnit)
        : null;

    setSaving(true);
    const res = await createActivity({
      id: crypto.randomUUID(),
      activityTypeId: typeId,
      scheduledDate: date,
      title: title.trim(),
      description: description.trim() || null,
      plannedDurationMin: Number.isFinite(plannedDurationMin)
        ? plannedDurationMin
        : null,
      plannedDistanceKm:
        plannedDistanceKm != null && Number.isFinite(plannedDistanceKm)
          ? plannedDistanceKm
          : null,
    });
    setSaving(false);
    if (!res.success) {
      toast.error(res.error || "Could not create activity");
      return;
    }
    if (closeAfter) {
      onOpenChange(false);
    } else {
      // Add-another flow — keep dialog open, clear the fields likely to change.
      setTitle("");
      setDescription("");
      setDuration("");
      setDistance("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>New activity</DialogTitle>
          <DialogDescription>
            Schedule a one-off session. Use the repeat icon on the planner
            for a recurring series instead.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
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
                            className="size-2 rounded-full"
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

          <Field label="Title">
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) {
                  e.preventDefault();
                  void handleSubmit(true);
                }
              }}
              placeholder="Morning run, Bench day…"
              className="h-9"
            />
          </Field>

          <Field label="Date">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9"
            />
          </Field>

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

          <Field label="Notes (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Anything to remember…"
              className="min-h-[60px] resize-y rounded-lg border border-[var(--edge)] bg-[var(--surface-raised)] px-2 py-1.5 text-meta outline-none transition-[border-color,box-shadow] duration-[160ms] ease-out focus:border-[var(--edge-strong)] focus:shadow-[var(--shadow-card)]"
            />
          </Field>
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleSubmit(false)}
            disabled={!canSubmit}
          >
            Add another
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSubmit(true)}
            disabled={!canSubmit}
          >
            {saving ? "Adding…" : "Add activity"}
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
      <div className="text-micro text-[var(--sd-ink-dull)]">
        {label}
      </div>
      {children}
    </div>
  );
}
