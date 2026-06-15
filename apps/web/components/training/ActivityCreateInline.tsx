"use client";

import { createActivity } from "@/app/actions/training";
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
import type { ActivityWithType, TypeWithBatch } from "@/lib/db/queries/training";
import { type DistanceUnit, displayToKm } from "@/lib/training/distance";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ActivityOptimisticDispatch } from "./TrainingClient";

interface Props {
  dateISO: string;
  types: TypeWithBatch[];
  distanceUnit: DistanceUnit;
  /** RT-06 optimistic dispatch — the new card appears instantly in the column. */
  addOptimistic: ActivityOptimisticDispatch;
}

/**
 * Bottom-of-column "+ Add activity" inline form. Collapsed by default; expands
 * on click. Optimistic create via client-generated UUID (RT-05 dedupe) so the
 * Realtime echo can match the optimistic insert by id when the cache refreshes.
 */
export function ActivityCreateInline({ dateISO, types, distanceUnit, addOptimistic }: Props) {
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [durationStr, setDurationStr] = useState("");
  const [distanceStr, setDistanceStr] = useState("");
  const [pending, setPending] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Group types by batchName for the Select dropdown.
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
    if (open) {
      titleRef.current?.focus();
    } else {
      setTitle("");
      setDurationStr("");
      setDistanceStr("");
    }
  }, [open]);

  // Default to the first available type when expanding.
  useEffect(() => {
    if (open && !typeId && types[0]) setTypeId(types[0].id);
  }, [open, typeId, types]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (pending) return;
    if (!typeId) {
      toast.error("Pick an activity type first");
      return;
    }
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    const plannedDurationMin = durationStr ? Number.parseInt(durationStr, 10) : null;
    const plannedDistanceKm =
      showDistance && distanceStr
        ? displayToKm(Number.parseFloat(distanceStr), distanceUnit)
        : null;

    // RT-05 — client-generated UUID lets the Realtime echo dedupe by id.
    const newId = crypto.randomUUID();
    const durationMin = Number.isFinite(plannedDurationMin) ? plannedDurationMin : null;
    const distanceKm =
      plannedDistanceKm != null && Number.isFinite(plannedDistanceKm) ? plannedDistanceKm : null;

    // Optimistic insert — the card shows in this column instantly. The overlay
    // holds it until the week query refetches with the canonical row.
    if (selectedType) {
      const now = new Date();
      const optimisticRow: ActivityWithType = {
        id: newId,
        userId: "",
        activityTypeId: typeId,
        scheduledDate: dateISO,
        title: title.trim(),
        description: null,
        plannedDurationMin: durationMin,
        actualDurationMin: null,
        plannedDistanceKm: distanceKm != null ? distanceKm.toString() : null,
        actualDistanceKm: null,
        status: "planned",
        dayOrderIndex: Number.MAX_SAFE_INTEGER,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        type: {
          id: selectedType.id,
          name: selectedType.name,
          color: selectedType.color,
          hasDistance: selectedType.hasDistance,
          batchId: selectedType.batchId,
          icon: selectedType.icon,
        },
      };
      addOptimistic({ type: "insert", row: optimisticRow });
    }

    setPending(true);
    const res = await createActivity({
      id: newId,
      activityTypeId: typeId,
      scheduledDate: dateISO,
      title: title.trim(),
      plannedDurationMin: durationMin,
      plannedDistanceKm: distanceKm,
    });
    setPending(false);

    if (!res.success) {
      toast.error(res.error || "Could not create activity");
      addOptimistic({ type: "revert", id: newId });
      return;
    }
    // Keep the form open so the user can rapidly add another (Notion/Linear vibe).
    setTitle("");
    setDurationStr("");
    setDistanceStr("");
    titleRef.current?.focus();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={types.length === 0}
        className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={11} strokeWidth={1.5} />
        Add activity
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
        }
      }}
      className="flex flex-col gap-1.5 rounded border border-[var(--edge)] bg-[var(--bg)] p-1.5"
    >
      <Select value={typeId} onValueChange={setTypeId}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          {grouped.map(([groupName, list]) => (
            <SelectGroup key={groupName}>
              <SelectLabel>{groupName}</SelectLabel>
              {list.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="inline-flex items-center gap-1.5">
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

      <Input
        ref={titleRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="h-7 text-xs"
      />

      <div className="flex gap-1">
        <Input
          value={durationStr}
          onChange={(e) => setDurationStr(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="min"
          inputMode="numeric"
          className="h-7 flex-1 text-xs"
        />
        {showDistance ? (
          <Input
            value={distanceStr}
            onChange={(e) => setDistanceStr(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder={distanceUnit}
            inputMode="decimal"
            className="h-7 flex-1 text-xs"
          />
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-6 px-2 text-[10px]"
          disabled={pending || !title.trim() || !typeId}
        >
          Add
        </Button>
      </div>
    </form>
  );
}
