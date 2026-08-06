"use client";

import { createActivity } from "@/app/actions/training";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatISODate } from "@/lib/training/week";
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
  // Retroactive logging (issue #12): the date defaults to this column's day but
  // can be moved to any past day so a session done earlier lands on the right
  // date. `logDone` records it as a completed session (status='done' + actuals)
  // instead of a planned one.
  const [date, setDate] = useState(dateISO);
  const [logDone, setLogDone] = useState(false);
  const [durationStr, setDurationStr] = useState("");
  const [distanceStr, setDistanceStr] = useState("");
  const [pending, setPending] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Cap the date picker at today — you can't log a session that hasn't happened
  // yet. Mirrors the server-side guard in `createActivity`.
  const todayISO = formatISODate(new Date());

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
      setDate(dateISO);
      setLogDone(false);
      setDurationStr("");
      setDistanceStr("");
    }
  }, [open, dateISO]);

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

    // Future dates are only rejected when logging a completed session — the
    // planner still allows scheduling planned activities on future days.
    if (logDone && date > todayISO) {
      toast.error("Can't log a session for a future date");
      return;
    }

    const durationVal = durationStr ? Number.parseInt(durationStr, 10) : null;
    const distanceVal =
      showDistance && distanceStr
        ? displayToKm(Number.parseFloat(distanceStr), distanceUnit)
        : null;

    // RT-05 — client-generated UUID lets the Realtime echo dedupe by id.
    const newId = crypto.randomUUID();
    const durationMin = Number.isFinite(durationVal) ? durationVal : null;
    const distanceKm =
      distanceVal != null && Number.isFinite(distanceVal) ? distanceVal : null;

    // When logging a past session as already done (issue #12) the entered
    // duration/distance are the *actuals* — a retro log was never "planned", so
    // we leave the planned fields null and let stats coalesce
    // (`actualDurationMin ?? plannedDurationMin`). For a normal planned add they
    // remain the planned values, exactly as before.
    const durationPlanned = logDone ? null : durationMin;
    const distancePlanned = logDone ? null : distanceKm;
    const durationActual = logDone ? durationMin : null;
    const distanceActual = logDone ? distanceKm : null;

    // Optimistic insert — the card shows in the matching day column instantly.
    // The overlay holds it until the week query refetches the canonical row.
    if (selectedType) {
      const now = new Date();
      const optimisticRow: ActivityWithType = {
        id: newId,
        userId: "",
        activityTypeId: typeId,
        scheduledDate: date,
        title: title.trim(),
        description: null,
        plannedDurationMin: durationPlanned,
        actualDurationMin: durationActual,
        plannedDistanceKm: distancePlanned != null ? distancePlanned.toString() : null,
        actualDistanceKm: distanceActual != null ? distanceActual.toString() : null,
        status: logDone ? "done" : "planned",
        dayOrderIndex: Number.MAX_SAFE_INTEGER,
        completedAt: logDone ? now : null,
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
      scheduledDate: date,
      title: title.trim(),
      plannedDurationMin: durationPlanned,
      plannedDistanceKm: distancePlanned,
      ...(logDone
        ? {
            status: "done" as const,
            actualDurationMin: durationActual,
            actualDistanceKm: distanceActual,
          }
        : {}),
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
        className="flex w-full items-center gap-1 rounded-lg px-1.5 py-1 text-left text-micro text-[var(--sd-ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--surface-raised)] hover:text-[var(--sd-ink)] disabled:cursor-not-allowed disabled:opacity-40"
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
      // The composer is a card in the column well, same plate as the activity
      // cards it will produce.
      className="flex flex-col gap-1.5 rounded-xl border border-[var(--edge)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-card)]"
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
                    {/* Saturated identity dot — small accent, never a fill. */}
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

      {/* Retroactive logging (issue #12): override the date to back-date a
          session, and toggle "Logged" to record it as already done. */}
      <Input
        type="date"
        value={date}
        max={logDone ? todayISO : undefined}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Session date"
        className="h-7 text-xs"
      />

      <label className="flex cursor-pointer items-center gap-1.5 px-0.5 text-micro text-[var(--sd-ink-faint)]">
        <Checkbox
          checked={logDone}
          onCheckedChange={(v) => setLogDone(v === true)}
          className="size-3.5"
        />
        Logged (already done)
      </label>

      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-micro"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-6 px-2 text-micro"
          disabled={pending || !title.trim() || !typeId}
        >
          {logDone ? "Log" : "Add"}
        </Button>
      </div>
    </form>
  );
}
