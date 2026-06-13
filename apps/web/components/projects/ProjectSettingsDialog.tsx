"use client";

import {
  archiveProject,
  deleteProject,
  moveProjectToArea,
  unarchiveProject,
  updateProject,
} from "@/app/actions/projects";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ProjectOptimisticDispatch } from "./ProjectDetailClient";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: {
    id: string;
    name: string;
    areaId: string;
    startDate: string | null;
    endDate: string | null;
    archivedAt: string | Date | null;
  };
  allAreas: { id: string; name: string }[];
  addOptimisticProject: ProjectOptimisticDispatch;
}

/**
 * Project settings — the single surface for lifecycle actions that don't belong
 * inline in the header: run dates, moving between areas, archive/unarchive, and
 * delete. Mounted from the gear button in ProjectHeader.
 */
export function ProjectSettingsDialog({
  open,
  onOpenChange,
  project,
  allAreas,
  addOptimisticProject,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [startDate, setStartDate] = useState(project.startDate ?? "");
  const [endDate, setEndDate] = useState(project.endDate ?? "");
  const [areaId, setAreaId] = useState(project.areaId);
  const [savingDates, setSavingDates] = useState(false);
  const [moving, setMoving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isArchived = project.archivedAt != null;
  const datesDirty =
    (startDate || null) !== project.startDate || (endDate || null) !== project.endDate;

  async function handleSaveDates() {
    setSavingDates(true);
    const patch = {
      startDate: startDate || null,
      endDate: endDate || null,
    };
    addOptimisticProject({ type: "update", id: project.id, patch });
    startTransition(async () => {
      const r = await updateProject({ id: project.id, ...patch });
      setSavingDates(false);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast("Dates updated.");
    });
  }

  async function handleMove() {
    if (areaId === project.areaId) return;
    setMoving(true);
    const r = await moveProjectToArea({
      projectId: project.id,
      newAreaId: areaId,
    });
    setMoving(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast("Project moved.");
    onOpenChange(false);
    router.push(`/areas/${areaId}`);
  }

  async function handleArchiveToggle() {
    setArchiving(true);
    const r = isArchived ? await unarchiveProject(project.id) : await archiveProject(project.id);
    setArchiving(false);
    if (!r.success) {
      toast.error(r.error);
      return;
    }
    toast(isArchived ? "Project unarchived." : "Project archived.");
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    const r = await deleteProject(project.id);
    setDeleting(false);
    if (!r.success) {
      toast.error(r.error);
      setDeleteOpen(false);
      return;
    }
    toast("Project deleted.");
    setDeleteOpen(false);
    onOpenChange(false);
    router.push(`/areas/${project.areaId}`);
  }

  const otherAreas = allAreas;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl font-semibold">Project settings</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-6">
            {/* Run dates */}
            <section className="flex flex-col gap-3">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                Run dates
              </h3>
              <div className="flex gap-3">
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="ps-start" className="font-sans text-[13px]">
                    Start
                  </Label>
                  <Input
                    id="ps-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="ps-end" className="font-sans text-[13px]">
                    End
                  </Label>
                  <Input
                    id="ps-end"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <Button
                onClick={handleSaveDates}
                disabled={savingDates || !datesDirty}
                className="self-start"
              >
                {savingDates ? "Saving..." : "Save dates"}
              </Button>
            </section>

            {/* Move to area */}
            <section className="flex flex-col gap-3 border-t border-[var(--edge)] pt-5">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                Area
              </h3>
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label className="font-sans text-[13px]">Move to area</Label>
                  <Select value={areaId} onValueChange={setAreaId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select area" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherAreas.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleMove} disabled={moving || areaId === project.areaId}>
                  {moving ? "Moving..." : "Move"}
                </Button>
              </div>
            </section>

            {/* Lifecycle */}
            <section className="flex flex-col gap-3 border-t border-[var(--edge)] pt-5">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
                Lifecycle
              </h3>
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="font-serif text-sm text-[var(--ink)]">
                    {isArchived ? "Archived" : "Active"}
                  </span>
                  <span className="font-sans text-[12px] text-[var(--ink-muted)]">
                    {isArchived
                      ? "Hidden from the live area view."
                      : "Archive to move it out of the live view."}
                  </span>
                </div>
                <Button variant="outline" onClick={handleArchiveToggle} disabled={archiving}>
                  {archiving ? "..." : isArchived ? "Unarchive" : "Archive"}
                </Button>
              </div>
            </section>

            {/* Danger zone */}
            <section className="flex flex-col gap-3 border-t border-[var(--edge)] pt-5">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-destructive">
                Danger zone
              </h3>
              <div className="flex items-center justify-between gap-3">
                <span className="font-sans text-[12px] text-[var(--ink-muted)]">
                  Delete this project. Linked tasks and captures stay in your library.
                </span>
                <Button
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                  className="shrink-0"
                >
                  Delete
                </Button>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{project.name}&rdquo;? Linked tasks and captures stay in your library —
              they just lose this project link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Never mind
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
