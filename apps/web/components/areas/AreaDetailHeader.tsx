"use client";

import { updateArea } from "@/app/actions/areas";
import { ProjectCreateDialog } from "@/components/projects/ProjectCreateDialog";
import { usePendingAction } from "@/components/shared/use-pending-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  area: { id: string; name: string; emoji: string | null };
  allAreas: { id: string; name: string }[];
  graduationYear: number | null;
  projectCount: number;
}

/**
 * Detail-page header for /areas/[areaId].
 *
 * Shows the area name + emoji H1, project count, and two action buttons:
 * - "Edit area" — opens a dialog to rename + edit emoji
 * - "New project" — opens ProjectCreateDialog pre-scoped to this area
 *
 * All mutations use router.refresh() (SSR page, no optimistic dispatcher).
 */
export function AreaDetailHeader({ area, allAreas, graduationYear, projectCount }: Props) {
  const router = useRouter();
  const { run, pending: isSaving } = usePendingAction();

  // Edit area dialog
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(area.name);
  const [emoji, setEmoji] = useState(area.emoji ?? "");

  // New project dialog
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  async function handleSaveEdit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await run(() => updateArea({ id: area.id, name: trimmed, emoji: emoji.trim() || null }), {
      success: "Area updated.",
      onSuccess: () => {
        setEditOpen(false);
        router.refresh();
      },
    });
  }

  function openEdit() {
    setName(area.name);
    setEmoji(area.emoji ?? "");
    setEditOpen(true);
  }

  return (
    <>
      <header className="mt-2 mb-10 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-baseline gap-3">
            {area.emoji ? (
              <span className="text-3xl leading-none" aria-hidden="true">
                {area.emoji}
              </span>
            ) : null}
            <h1 className="font-serif text-4xl font-semibold tracking-tight text-[var(--ink)]">
              {area.name}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={openEdit}
              className="font-mono text-[11px] uppercase tracking-[0.08em] h-8 px-3 gap-1.5"
            >
              <Pencil className="h-3 w-3" />
              Edit area
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNewProjectOpen(true)}
              className="font-mono text-[11px] uppercase tracking-[0.08em] h-8 px-3 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              New project
            </Button>
          </div>
        </div>
        <p className="font-serif text-base text-[var(--ink-muted)]">
          {projectCount} active project{projectCount === 1 ? "" : "s"}.
        </p>
      </header>

      {/* Edit area dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit area</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="detail-edit-name">Name</Label>
              <Input
                id="detail-edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") setEditOpen(false);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="detail-edit-emoji">Emoji (optional)</Label>
              <Input
                id="detail-edit-emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={8}
                placeholder="e.g. 🎓"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={isSaving}>
              Never mind
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving || !name.trim()}>
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New project dialog */}
      <ProjectCreateDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        defaultAreaId={area.id}
        areas={allAreas}
        graduationYear={graduationYear}
      />
    </>
  );
}
