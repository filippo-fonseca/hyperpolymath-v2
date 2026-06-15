"use client";

import { completeActivity } from "@/app/actions/training";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActivityWithType } from "@/lib/db/queries/training";
import { type DistanceUnit, displayToKm, kmToDisplay } from "@/lib/training/distance";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ActivityOptimisticDispatch } from "./TrainingClient";

interface Props {
  activity: ActivityWithType | null;
  distanceUnit: DistanceUnit;
  open: boolean;
  /** RT-06 optimistic dispatch — the card flips to done instantly on submit. */
  addOptimistic: ActivityOptimisticDispatch;
  onOpenChange: (open: boolean) => void;
}

/**
 * CompleteActivityDialog — quick-completion modal (Phase 15 / D-08, D-09).
 *
 * D-08 (one-keystroke completion): open + Enter immediately submits with the
 * pre-filled planned values unchanged. We accomplish this by:
 *   1. Pre-filling both number inputs with the planned values (formatted in
 *      the user's distance unit).
 *   2. Wrapping inputs + buttons in a <form>. `onSubmit` calls the primary
 *      handler and prevents default — Enter from any focused field, including
 *      the autoFocused primary button, triggers submission.
 *   3. autoFocus on the primary "Mark done" button so the very first key
 *      press after open is Enter → submit.
 *
 * D-09 (single-click skip): a secondary "Skip logging — just mark done"
 * button calls `completeActivity({ id })` with no actuals, so the row goes to
 * `status='done'` with null actuals. This is the explicit escape hatch for
 * users who don't want to bother filling actuals (or who completed without
 * tracking).
 *
 * Distance conversion is at the IO boundary (Pitfall 6): display values live
 * in the user's preferred unit; on submit we call `displayToKm` before passing
 * to the Server Action, which always speaks km.
 */
export function CompleteActivityDialog({
  activity,
  distanceUnit,
  open,
  addOptimistic,
  onOpenChange,
}: Props) {
  const [durationStr, setDurationStr] = useState<string>("");
  const [distanceStr, setDistanceStr] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Reset inputs whenever the dialog opens for a new activity so prefill
  // reflects the latest planned values (Realtime echo of a card edit etc.).
  useEffect(() => {
    if (!open || !activity) return;
    setDurationStr(activity.plannedDurationMin != null ? String(activity.plannedDurationMin) : "");
    if (activity.type.hasDistance && activity.plannedDistanceKm != null) {
      const km = Number(activity.plannedDistanceKm);
      if (!Number.isNaN(km)) {
        setDistanceStr(kmToDisplay(km, distanceUnit).toFixed(2));
      } else {
        setDistanceStr("");
      }
    } else {
      setDistanceStr("");
    }
  }, [open, activity, distanceUnit]);

  if (!activity) return null;

  const hasDistance = activity.type.hasDistance;

  const submit = async (skipLogging: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload: {
        id: string;
        actualDurationMin?: number | null;
        actualDistanceKm?: number | null;
      } = { id: activity.id };

      if (!skipLogging) {
        const durTrim = durationStr.trim();
        if (durTrim) {
          const n = Number(durTrim);
          if (Number.isFinite(n) && n > 0) payload.actualDurationMin = Math.round(n);
        }
        if (hasDistance) {
          const distTrim = distanceStr.trim();
          if (distTrim) {
            const n = Number(distTrim);
            if (Number.isFinite(n) && n >= 0) {
              payload.actualDistanceKm = displayToKm(n, distanceUnit);
            }
          }
        }
      }

      // Optimistic — the card flips to done immediately; the overlay holds it
      // until the week query refetches with the canonical row.
      addOptimistic({
        type: "update",
        id: activity.id,
        patch: {
          status: "done",
          completedAt: new Date(),
          ...(payload.actualDurationMin != null
            ? { actualDurationMin: payload.actualDurationMin }
            : {}),
          ...(payload.actualDistanceKm != null
            ? { actualDistanceKm: payload.actualDistanceKm.toString() }
            : {}),
        },
      });

      const res = await completeActivity(payload);
      if (!res.success) {
        toast.error(res.error || "Could not mark done");
        addOptimistic({ type: "revert", id: activity.id });
        return;
      }
      toast.success(skipLogging ? "Marked done" : "Logged");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{activity.title}</DialogTitle>
          <DialogDescription>
            {activity.type.name}
            {activity.plannedDurationMin != null
              ? ` · planned ${activity.plannedDurationMin}m`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(false);
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="actual-duration"
              className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]"
            >
              Actual duration (min)
            </Label>
            <Input
              id="actual-duration"
              type="number"
              inputMode="numeric"
              min={1}
              max={1440}
              value={durationStr}
              onChange={(e) => setDurationStr(e.target.value)}
              className="h-9"
            />
          </div>

          {hasDistance ? (
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="actual-distance"
                className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]"
              >
                Actual distance ({distanceUnit})
              </Label>
              <Input
                id="actual-distance"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={distanceStr}
                onChange={(e) => setDistanceStr(e.target.value)}
                className="h-9"
              />
            </div>
          ) : null}

          <DialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => void submit(true)}
              className="font-mono text-[11px] uppercase tracking-[0.06em]"
            >
              Skip logging — just mark done
            </Button>
            <Button type="submit" autoFocus disabled={submitting}>
              Mark done
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
