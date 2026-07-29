"use client";

import { createHabit, updateHabit } from "@/app/actions/habits";
import type { HabitWithAreas } from "@/app/actions/habits";
import { Spinner } from "@/components/shared/Spinner";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { HabitFrequencySelector } from "./HabitFrequencySelector";

export interface AreaOption {
  id: string;
  name: string;
  emoji: string | null;
}

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: AreaOption[];
  /** Called on successful save with the new/updated habit id. */
  onSaved?: (id: string) => void;
}

type Props =
  | (BaseProps & { mode: "create"; habit?: undefined })
  | (BaseProps & { mode: "edit"; habit: HabitWithAreas });

const EVERY_DAY: boolean[] = [true, true, true, true, true, true, true];

/**
 * Combined create + edit dialog for habits. Two modes:
 *   - create: empty form, server `createHabit`.
 *   - edit:   pre-filled from `habit`, server `updateHabit`.
 *
 * Same component so the schedule selector + area multi-select layout stays
 * in lockstep across both flows.
 */
export function HabitDialog(props: Props) {
  const { open, onOpenChange, areas, onSaved } = props;

  // ── form state ─────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [daysOfWeek, setDaysOfWeek] = useState<boolean[]>(EVERY_DAY);
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  // Rehydrate form when the dialog opens. We reset on close so re-opening
  // doesn't surface stale values from the previous session.
  // biome-ignore lint/correctness/useExhaustiveDependencies: rehydrate exactly once per open, not on every prop identity change
  useEffect(() => {
    if (!open) return;
    if (props.mode === "edit") {
      setName(props.habit.name);
      setDescription(props.habit.description ?? "");
      setDaysOfWeek(props.habit.daysOfWeek);
      setAreaIds(props.habit.areas.map((a) => a.id));
    } else {
      setName("");
      setDescription("");
      setDaysOfWeek(EVERY_DAY);
      setAreaIds([]);
    }
  }, [open]);

  const noDaysSelected = !daysOfWeek.some(Boolean);
  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && !noDaysSelected && !pending;

  function handleSubmit() {
    if (!canSave) return;
    startTransition(async () => {
      const payload = {
        name: trimmed,
        description: description.trim() || null,
        daysOfWeek,
        areaIds,
      };
      const r =
        props.mode === "create"
          ? await createHabit(payload)
          : await updateHabit({ id: props.habit.id, ...payload });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(props.mode === "create" ? "Habit added." : "Habit updated.");
      const id = props.mode === "create" && r.data ? r.data.id : (props.habit?.id ?? "");
      onSaved?.(id);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.mode === "create" ? "New habit" : "Edit habit"}</DialogTitle>
          <DialogDescription className="sr-only">
            {props.mode === "create"
              ? "Add a new habit with a weekly schedule."
              : "Edit this habit's name, description, schedule, or areas."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          {/* Name */}
          {/* biome-ignore lint/a11y/noLabelWithoutControl: the label wraps <Input>, which renders the control */}
          <label className="flex flex-col gap-2">
            <span className="text-micro font-medium text-[var(--ink-muted)]">Name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Run, read, meditate…"
              maxLength={120}
              autoFocus
            />
          </label>

          {/* Description */}
          {/* biome-ignore lint/a11y/noLabelWithoutControl: the label wraps <Textarea>, which renders the control */}
          <label className="flex flex-col gap-2">
            <span className="text-micro font-medium text-[var(--ink-muted)]">
              Description <span className="opacity-60">(optional)</span>
            </span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A sentence on why this habit matters."
              maxLength={500}
              rows={2}
            />
          </label>

          {/* Schedule */}
          <div className="flex flex-col gap-2">
            <span className="text-micro font-medium text-[var(--ink-muted)]">Schedule</span>
            <HabitFrequencySelector value={daysOfWeek} onChange={setDaysOfWeek} />
            <span
              className={cn(
                "text-[12px]",
                noDaysSelected ? "text-[var(--ink-coral)]" : "text-[var(--sd-ink-dull)]"
              )}
            >
              {noDaysSelected
                ? "Pick at least one day."
                : daysOfWeek.every(Boolean)
                  ? "Every day."
                  : `${daysOfWeek.filter(Boolean).length} day${
                      daysOfWeek.filter(Boolean).length === 1 ? "" : "s"
                    } a week.`}
            </span>
          </div>

          {/* Areas */}
          <div className="flex flex-col gap-2">
            <span className="text-micro font-medium text-[var(--ink-muted)]">
              Areas <span className="opacity-60">(zero or more)</span>
            </span>
            {areas.length === 0 ? (
              <p className="text-[13px] text-[var(--sd-ink-dull)]">
                No areas yet — create one from the sidebar first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {areas.map((a) => {
                  const selected = areaIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() =>
                        setAreaIds((prev) =>
                          selected ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                        )
                      }
                      aria-pressed={selected}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-lg px-2 py-1",
                        "text-meta",
                        "border transition-colors duration-[160ms] ease-out cursor-pointer-always",
                        selected
                          ? "border-[var(--edge-strong)] bg-[var(--selected)] text-[var(--ink)]"
                          : "border-[var(--edge)] bg-transparent text-[var(--ink-muted)] hover:border-[var(--edge-strong)] hover:text-[var(--ink)]"
                      )}
                    >
                      {selected ? <Check size={12} className="shrink-0" /> : null}
                      {a.emoji ? <span aria-hidden="true">{a.emoji}</span> : null}
                      <span>{a.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSave}>
            {pending ? (
              <>
                <Spinner size={14} label="Saving habit" />
                Saving…
              </>
            ) : props.mode === "create" ? (
              "Add habit"
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
