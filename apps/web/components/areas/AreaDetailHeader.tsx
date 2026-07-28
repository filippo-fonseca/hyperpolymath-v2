"use client";

import { deleteArea, updateArea } from "@/app/actions/areas";
import { ProjectCreateDialog } from "@/components/projects/ProjectCreateDialog";
import { Spinner } from "@/components/shared/Spinner";
import { usePendingAction } from "@/components/shared/use-pending-action";
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
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
 * The rename settles into local state rather than refetching the route: the
 * only thing on this page that reads the area's name and emoji is this header
 * (the breadcrumb above it is rendered from the same server props and is
 * corrected on the next navigation), and the sidebar reconciles itself off the
 * Realtime echo on ['areas', userId]. Deleting the area still refreshes,
 * because it navigates to /areas and that destination must not be served from
 * a router-cache entry that still lists the deleted area.
 */
export function AreaDetailHeader({ area, allAreas, graduationYear, projectCount }: Props) {
  const router = useRouter();
  const { run, pending: isSaving } = usePendingAction();
  const { run: runDelete, pending: isDeleting } = usePendingAction();

  // Edit area dialog
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(area.name);
  const [emoji, setEmoji] = useState(area.emoji ?? "");

  // What the H1 shows. Seeded from the server prop, re-seeded whenever the
  // server sends a new one, and updated in place on a successful rename.
  const [displayName, setDisplayName] = useState(area.name);
  const [displayEmoji, setDisplayEmoji] = useState(area.emoji);
  useEffect(() => {
    setDisplayName(area.name);
    setDisplayEmoji(area.emoji);
  }, [area.name, area.emoji]);

  // New project dialog
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  async function handleSaveEdit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await run(() => updateArea({ id: area.id, name: trimmed, emoji: emoji.trim() || null }), {
      success: "Area updated.",
      onSuccess: () => {
        setEditOpen(false);
        setDisplayName(trimmed);
        setDisplayEmoji(emoji.trim() || null);
      },
    });
  }

  async function handleDeleteArea() {
    await runDelete(() => deleteArea(area.id), {
      success: "Area deleted.",
      onSuccess: () => {
        setDeleteOpen(false);
        router.push("/areas");
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
            {displayEmoji ? (
              <span className="text-3xl leading-none" aria-hidden="true">
                {displayEmoji}
              </span>
            ) : null}
            <h1 className="text-4xl font-semibold tracking-tight text-[var(--ink)]">
              {displayName}
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
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="font-mono text-[11px] uppercase tracking-[0.08em] h-8 px-3 gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
        <p className="text-base text-[var(--ink-muted)]">
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
              {isSaving ? (
                <>
                  <Spinner size={14} label="Saving area" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete area dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this area?</DialogTitle>
            <DialogDescription>
              This permanently deletes <strong>{area.name}</strong>. Any projects under it will be
              moved to the <strong>No Area</strong> bucket. Tasks and captures stay intact.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>
              Never mind
            </Button>
            <Button variant="destructive" onClick={handleDeleteArea} disabled={isDeleting}>
              {isDeleting ? (
                <>
                  <Spinner size={14} label="Deleting area" />
                  Deleting…
                </>
              ) : (
                "Delete area"
              )}
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
