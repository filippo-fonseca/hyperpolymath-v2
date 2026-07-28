"use client";

/**
 * `ProjectBarPopover` — the click affordance on a bar, and the accessible /
 * keyboard path to editing dates (u4's drag is the pointer path; this is not a
 * fallback, it is the equal partner).
 *
 * THE ARCHIVE TRAP (DESIGN.md, Issue #55): an `end_date` in the past makes a
 * project count as archived EVERYWHERE — sidebar, /areas, /lifeos — even with
 * `archived_at IS NULL`. So any edit that would strand a project in the past
 * has to say so before it commits, in those words: the project disappears.
 *
 * The popover reports the new dates and nothing else. The optimistic update and
 * the undo toast belong to the parent, which owns the row state — that keeps
 * this component pure and testable, and keeps one undo path for both this and
 * u4's drag.
 *
 * The bar is the anchor, not the trigger: TimelineBar's own onClick drives
 * `open`, so a Radix trigger would fight it for the same click.
 */

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { isProjectExpired } from "@/lib/projects/archive-status";
import type { TimelineRowProject } from "@/lib/projects/timeline";

export interface TimelineDatePatch {
  startDate: string | null;
  endDate: string | null;
}

interface Props {
  project: TimelineRowProject;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitDates: (patch: TimelineDatePatch) => void;
  todayISO: string;
  children: ReactNode;
}

/** "" from a cleared native date input means "no date", not an empty string. */
function toNullableISO(value: string): string | null {
  return value.trim() === "" ? null : value;
}

export function ProjectBarPopover({
  project,
  open,
  onOpenChange,
  onCommitDates,
  todayISO,
  children,
}: Props) {
  const [startDate, setStartDate] = useState(project.startDate ?? "");
  const [endDate, setEndDate] = useState(project.endDate ?? "");
  const [confirmingTrap, setConfirmingTrap] = useState(false);

  // Reopening on a row whose dates moved underneath us (realtime, or u4's drag)
  // must show the truth, not a stale draft.
  useEffect(() => {
    if (open) {
      setStartDate(project.startDate ?? "");
      setEndDate(project.endDate ?? "");
      setConfirmingTrap(false);
    }
  }, [open, project.startDate, project.endDate]);

  const patch: TimelineDatePatch = {
    startDate: toNullableISO(startDate),
    endDate: toNullableISO(endDate),
  };

  const dirty =
    patch.startDate !== (project.startDate ?? null) || patch.endDate !== (project.endDate ?? null);

  // ISO YYYY-MM-DD strings compare correctly as strings — never parse them into
  // Date, which reads them as UTC midnight and lands a day early west of GMT.
  const inverted =
    patch.startDate !== null && patch.endDate !== null && patch.startDate > patch.endDate;

  // Only a trap if the edit CREATES it. A project already sitting in the past
  // has nothing left to warn about.
  const wouldArchive =
    !inverted &&
    isProjectExpired({ ...project, endDate: patch.endDate }, todayISO) &&
    !isProjectExpired(project, todayISO);

  function commit() {
    onCommitDates(patch);
    setConfirmingTrap(false);
    onOpenChange(false);
  }

  function handleSave() {
    if (inverted) return;
    if (wouldArchive && !confirmingTrap) {
      setConfirmingTrap(true);
      return;
    }
    commit();
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[280px] space-y-3"
        data-testid="timeline-bar-popover"
      >
        <div className="space-y-1">
          <Link
            href={`/projects/${project.id}`}
            className="block truncate font-medium text-body text-[var(--sd-ink)] hover:underline"
          >
            {project.icon ? <span className="mr-1.5">{project.icon}</span> : null}
            {project.name}
          </Link>
          {project.isGhost ? (
            <p className="font-sans text-micro font-medium text-[var(--ink-faint)]">Archived</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="block font-sans text-micro font-medium text-[var(--ink-faint)]">
              Start
            </span>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8"
              data-testid="timeline-start-input"
            />
          </label>
          <label className="space-y-1">
            <span className="block font-sans text-micro font-medium text-[var(--ink-faint)]">
              End
            </span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-8"
              data-testid="timeline-end-input"
            />
          </label>
        </div>

        {inverted ? (
          <p className="text-meta text-[var(--ink-coral)]" data-testid="timeline-inverted-warning">
            End date is before the start date.
          </p>
        ) : null}

        {confirmingTrap ? (
          <div
            className="space-y-2 rounded-lg bg-[color-mix(in_oklch,var(--ink-amber)_15%,transparent)] p-2.5"
            data-testid="timeline-archive-warning"
          >
            <p className="text-meta text-[var(--sd-ink-dull)] leading-snug">
              An end date in the past archives{" "}
              <strong className="text-[var(--sd-ink)]">{project.name}</strong>. It disappears from
              the sidebar, /areas, and /lifeos until you clear the date or show archived.
            </p>
            <div className="flex justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => setConfirmingTrap(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7"
                onClick={commit}
                data-testid="timeline-archive-confirm"
              >
                Archive anyway
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              className="h-7"
              disabled={!dirty || inverted}
              onClick={handleSave}
              data-testid="timeline-save-dates"
            >
              Save
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
