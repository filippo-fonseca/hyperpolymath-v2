"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateDistanceUnit } from "@/app/(app)/settings/actions";
import type { DistanceUnit } from "@/lib/training/distance";

interface Props {
  value: DistanceUnit;
}

/**
 * DistanceUnitToggle — km | mi segmented control on /settings.
 *
 * Phase 15 Plan 06 (TRN-14, D-10). The signed-in user's distance unit lives
 * on `users.distance_unit` (canonical storage = km). This toggle is the
 * single source of truth that flips display formatting across the training
 * surfaces (planner, dialog, widget, stats).
 *
 * - Calls `updateDistanceUnit` Server Action (getClaims + Zod-validated).
 * - Optimistic local state so the segment lights up instantly; reverts on
 *   action error and surfaces via sonner.
 * - useTransition keeps the action call non-blocking so the segmented control
 *   stays interactive while revalidatePath fans out.
 */
export function DistanceUnitToggle({ value }: Props) {
  const [current, setCurrent] = useState<DistanceUnit>(value);
  const [isPending, startTransition] = useTransition();

  function handleSelect(next: DistanceUnit) {
    if (next === current) return;
    const previous = current;
    setCurrent(next); // optimistic
    startTransition(async () => {
      const r = await updateDistanceUnit(next);
      if (!r.success) {
        setCurrent(previous);
        toast.error(r.error);
        return;
      }
      toast(`Distance unit set to ${next === "km" ? "kilometers" : "miles"}.`);
    });
  }

  const options: ReadonlyArray<{ value: DistanceUnit; label: string }> = [
    { value: "km", label: "Kilometers (km)" },
    { value: "mi", label: "Miles (mi)" },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Distance unit"
      className="inline-flex rounded-md border border-[var(--edge)] bg-[var(--canvas)] p-0.5"
    >
      {options.map((opt) => {
        const selected = opt.value === current;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={isPending && !selected}
            onClick={() => handleSelect(opt.value)}
            className={`font-mono text-xs uppercase tracking-[0.08em] px-3 py-1.5 rounded-sm transition-colors duration-100 cursor-pointer-always disabled:opacity-50 ${
              selected
                ? "bg-[var(--surface)] text-[var(--ink)] border border-[var(--edge-hud)]"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
