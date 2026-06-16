"use client";

import { deleteProject, updateProject } from "@/app/actions/projects";
import { MoveProjectDialog } from "@/components/areas/MoveProjectDialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  projectIcon: string | null;
  isClass: boolean;
  currentAreaId: string;
  allAreas: { id: string; name: string }[];
}

/**
 * Per-project-card ⋯ dropdown on the /areas/[areaId] detail page.
 *
 * Items: Rename / Edit details / Move to another area / Delete.
 * Uses router.refresh() as the settle path (SSR page, no optimistic dispatcher).
 */
export function AreaProjectCardMenu({
  projectId,
  projectName,
  projectDescription,
  projectIcon,
  isClass,
  currentAreaId,
  allAreas,
}: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  // Rename
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(projectName);
  const { run: runRename, pending: isRenaming } = usePendingAction();

  // Edit details
  const [editOpen, setEditOpen] = useState(false);
  const [editDescription, setEditDescription] = useState(projectDescription ?? "");
  const [editIcon, setEditIcon] = useState(projectIcon ?? "");
  const { run: runSaveEdit, pending: isSavingEdit } = usePendingAction();

  // Move
  const [moveOpen, setMoveOpen] = useState(false);

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { run: runDelete, pending: isDeleting } = usePendingAction();

  async function handleRename() {
    const trimmed = renameName.trim();
    if (!trimmed) return;
    await runRename(() => updateProject({ id: projectId, name: trimmed }), {
      success: "Project renamed.",
      onSuccess: () => {
        setRenameOpen(false);
        router.refresh();
      },
    });
  }

  async function handleSaveEdit() {
    await runSaveEdit(
      () =>
        updateProject({
          id: projectId,
          description: editDescription.trim() || null,
          icon: editIcon.trim() || null,
        }),
      {
        success: "Project updated.",
        onSuccess: () => {
          setEditOpen(false);
          router.refresh();
        },
      }
    );
  }

  async function handleDelete() {
    await runDelete(() => deleteProject(projectId), {
      success: "Project deleted.",
      onSuccess: () => {
        setDeleteOpen(false);
        router.refresh();
      },
    });
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Project options"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={[
              "flex items-center justify-center h-6 w-6 rounded",
              "text-[var(--ink-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink)]",
              "opacity-0 group-hover:opacity-100",
              "data-[state=open]:opacity-100 transition-opacity duration-150",
              "focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-[var(--edge-hud)] outline-none",
            ].join(" ")}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onSelect={() => {
              setRenameName(projectName);
              setMenuOpen(false);
              setRenameOpen(true);
            }}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setEditDescription(projectDescription ?? "");
              setEditIcon(projectIcon ?? "");
              setMenuOpen(false);
              setEditOpen(true);
            }}
          >
            Edit details
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setMenuOpen(false);
              setMoveOpen(true);
            }}
          >
            Move to another area
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => {
              setMenuOpen(false);
              setDeleteOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              maxLength={100}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") setRenameOpen(false);
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)} disabled={isRenaming}>
              Never mind
            </Button>
            <Button onClick={handleRename} disabled={isRenaming || !renameName.trim()}>
              {isRenaming ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit details dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit details</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-proj-desc" className="font-sans text-[13px]">
                Description
              </Label>
              <Textarea
                id="edit-proj-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional project description"
                className="resize-none min-h-[72px]"
                maxLength={2000}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-proj-icon" className="font-sans text-[13px]">
                Icon (lucide icon name)
              </Label>
              <Input
                id="edit-proj-icon"
                value={editIcon}
                onChange={(e) => setEditIcon(e.target.value)}
                placeholder="e.g. book-open, graduation-cap"
                maxLength={50}
              />
            </div>
            {isClass && (
              <p className="font-serif text-sm text-[var(--ink-muted)]">
                Edit class fields on the{" "}
                <Link
                  href={`/projects/${projectId}`}
                  className="underline underline-offset-2 hover:text-[var(--ink)]"
                  onClick={() => setEditOpen(false)}
                >
                  project page
                </Link>{" "}
                →
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={isSavingEdit}>
              Never mind
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
              {isSavingEdit ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to another area dialog */}
      <MoveProjectDialog
        projectId={projectId}
        projectName={projectName}
        currentAreaId={currentAreaId}
        allAreas={allAreas}
        open={moveOpen}
        onOpenChange={setMoveOpen}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              Delete &ldquo;{projectName}&rdquo;? Linked tasks and captures stay in your library —
              they just lose this project link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isDeleting}>
              Never mind
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
