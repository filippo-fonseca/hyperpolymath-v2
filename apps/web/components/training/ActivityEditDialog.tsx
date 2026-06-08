"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteActivity, updateActivity } from "@/app/actions/training";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  ActivityWithType,
  TypeWithBatch,
} from "@/lib/db/queries/training";
import {
  displayToKm,
  kmToDisplay,
  type DistanceUnit,
} from "@/lib/training/distance";

interface Props {
  activity: ActivityWithType | null;
  types: TypeWithBatch[];
  distanceUnit: DistanceUnit;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * ActivityEditDialog — full edit surface for an existing activity (TRN-07).
 *
 * Fields: type (Select), title, description, planned duration, planned
 * distance (only when the selected type's `hasDistance` is true).
 *
 * Submit calls `updateActivity` with the patch. Delete (with a single confirm
 * step rendered inline as a second click) calls `deleteActivity` — there's no
 * undo since activity history is non-audited (D-11).
 *
 * Distance conversion at the IO boundary (Pitfall 6): display values are in
 * the user's unit; on submit we call `displayToKm` before passing to the
 * Server Action.
 */
export function ActivityEditDialog({
  activity,
  types,
  distanceUnit,
  open,
  onOpenChange,
}: Props) {
  const [typeId, setTypeId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [durationStr, setDurationStr] = useState<string>("");
  const [distanceStr, setDistanceStr] = useState<string>("");
  const [confirmingDelete, setConfirmingDelete] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (!open || !activity) return;
    setTypeId(activity.activityTypeId);
    setTitle(activity.title);
    setDescription(activity.description ?? "");
    setDurationStr(
      activity.plannedDurationMin != null
        ? String(activity.plannedDurationMin)
        : "",
    );
    if (activity.plannedDistanceKm != null) {
      const km = Number(activity.plannedDistanceKm);
      setDistanceStr(
        Number.isFinite(km) ? kmToDisplay(km, distanceUnit).toFixed(2) : "",
      );
    } else {
      setDistanceStr("");
    }
    setConfirmingDelete(false);
  }, [open, activity, distanceUnit]);

  const selectedType = useMemo(
    () => types.find((t) => t.id === typeId) ?? null,
    [types, typeId],
  );

  if (!activity) return null;

  const hasDistance = selectedType?.hasDistance ?? activity.type.hasDistance;

  const submit = async () => {
    if (submitting) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Title is required");
      return;
    }
    setSubmitting(true);
    try {
      const patch: Parameters<typeof updateActivity>[0] = {
        id: activity.id,
        activityTypeId: typeId,
        title: trimmedTitle,
        description: description.trim() ? description.trim() : null,
      };

      const durTrim = durationStr.trim();
      if (durTrim) {
        const n = Number(durTrim);
        if (Number.isFinite(n) && n > 0) {
          (patch as Record<string, unknown>).plannedDurationMin =
            Math.round(n);
        }
      } else {
        (patch as Record<string, unknown>).plannedDurationMin = null;
      }

      if (hasDistance) {
        const distTrim = distanceStr.trim();
        if (distTrim) {
          const n = Number(distTrim);
          if (Number.isFinite(n) && n >= 0) {
            (patch as Record<string, unknown>).plannedDistanceKm =
              displayToKm(n, distanceUnit);
          }
        } else {
          (patch as Record<string, unknown>).plannedDistanceKm = null;
        }
      } else {
        (patch as Record<string, unknown>).plannedDistanceKm = null;
      }

      const res = await updateActivity(patch);
      if (!res.success) {
        toast.error(res.error || "Could not save");
        return;
      }
      toast.success("Saved");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await deleteActivity({ id: activity.id });
      if (!res.success) {
        toast.error(res.error || "Could not delete");
        return;
      }
      toast.success("Deleted");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit activity</DialogTitle>
          <DialogDescription>
            Scheduled for {activity.scheduledDate}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="edit-type"
              className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]"
            >
              Type
            </Label>
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger id="edit-type" className="h-9">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color }}
                        aria-hidden
                      />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="edit-title"
              className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]"
            >
              Title
            </Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label
              htmlFor="edit-description"
              className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]"
            >
              Notes
            </Label>
            <Textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="edit-duration"
                className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]"
              >
                Planned duration (min)
              </Label>
              <Input
                id="edit-duration"
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
                  htmlFor="edit-distance"
                  className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]"
                >
                  Planned distance ({distanceUnit})
                </Label>
                <Input
                  id="edit-distance"
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
          </div>

          <DialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={handleDelete}
              className={
                confirmingDelete
                  ? "text-[var(--danger,#dc2626)]"
                  : "text-[var(--ink-muted)]"
              }
            >
              {confirmingDelete ? "Click again to delete" : "Delete"}
            </Button>
            <Button type="submit" disabled={submitting}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
