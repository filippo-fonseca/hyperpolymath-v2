"use client";

import { archiveArea, deleteArea, unarchiveArea, updateArea } from "@/app/actions/areas";
import { Spinner } from "@/components/shared/Spinner";
import type { AreaOptimisticDispatch } from "@/components/shell/Sidebar";
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
import { MoreHorizontal } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

interface Props {
  areaId: string;
  areaName: string;
  isArchived: boolean;
  /** External "open" trigger from a right-click on the row. Optional. */
  rightClickOpen?: boolean;
  onRightClickClose?: () => void;
  /**
   * Phase 3 optimistic dispatcher provided by Sidebar (M3 owner). Each menu
   * action dispatches against the same useOptimistic state Sidebar owns, so
   * AreaCreateDialog and SidebarTree all see the same instant-feedback rows.
   */
  addOptimisticArea: AreaOptimisticDispatch;
  /**
   * Phase 6 Plan 06-02 (RES-02) — when provided, the archive action defers
   * to this parent-supplied handler which wraps the flow in the shared
   * useUndoToast helper (sonner 5s Undo). Replaces the inline
   * toast.action({label: "Undo"}) pattern. Optional for backward compat
   * with any other callsites.
   */
  onArchiveWithUndo?: (areaId: string, areaName: string) => void;
}

/**
 * Notion-style row actions menu. Renders a hover-revealed `⋯` button as the
 * trigger. Also responds to a parent-controlled `rightClickOpen` boolean to
 * support right-click-as-shortcut from the row itself.
 */
export function AreaActionsMenu({
  areaId,
  areaName,
  isArchived,
  rightClickOpen,
  onRightClickClose,
  addOptimisticArea,
  onArchiveWithUndo,
}: Props) {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState(areaName);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

  // Sync external (right-click) open with internal state
  const effectiveOpen = open || !!rightClickOpen;
  const setEffectiveOpen = (next: boolean) => {
    setOpen(next);
    if (!next && rightClickOpen) onRightClickClose?.();
  };

  function handleArchive() {
    setEffectiveOpen(false);
    // Phase 6 Plan 06-02 (RES-02): when SidebarTree supplies onArchiveWithUndo,
    // route through the shared useUndoToast helper (5s sonner Undo). Falls
    // back to the legacy inline toast.action pattern if the prop is absent
    // (defensive — current SidebarTree always passes it).
    if (onArchiveWithUndo) {
      onArchiveWithUndo(areaId, areaName);
      return;
    }
    startTransition(async () => {
      // D-04: optimistic delete (active list excludes archived; the canonical
      // refetch via Realtime echo will reconcile if "Show archived" is toggled).
      addOptimisticArea({ type: "delete", id: areaId });
      const result = await archiveArea(areaId);
      if (!result.success) {
        // D-03: silent revert + toast.error
        toast.error(result.error);
        return;
      }
      toast("Area archived.", {
        action: {
          label: "Undo",
          onClick: () => {
            startTransition(async () => {
              const undoResult = await unarchiveArea(areaId);
              if (!undoResult.success) {
                toast.error(undoResult.error);
              }
              // Realtime echo will restore the row; no manual refresh needed.
            });
          },
        },
        duration: 4000,
      });
    });
  }

  function handleUnarchive() {
    setEffectiveOpen(false);
    startTransition(async () => {
      // Unarchive: from archived state back into active list. We don't have
      // the full SidebarArea row to optimistically insert into the active list
      // (it's only in initialAllAreas). Skip optimism here — Realtime echo
      // handles the refresh within ~1s. Rare path; acceptable tradeoff.
      const result = await unarchiveArea(areaId);
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  async function handleDelete() {
    setIsDeleting(true);
    // D-04: optimistic delete first — UI flips instantly
    addOptimisticArea({ type: "delete", id: areaId });
    const result = await deleteArea(areaId);
    setIsDeleting(false);
    if (!result.success) {
      // D-03: silent revert + toast.error
      toast.error(result.error);
      setDeleteDialogOpen(false);
      return;
    }
    toast("Area deleted.");
    setDeleteDialogOpen(false);
    // Realtime DELETE echo invalidates → refetch → cache aligns.
  }

  async function handleRename() {
    const trimmed = renameName.trim();
    if (!trimmed || trimmed === areaName) {
      setRenameDialogOpen(false);
      return;
    }
    setIsRenaming(true);
    // D-04: optimistic rename — header updates instantly
    addOptimisticArea({ type: "update", id: areaId, patch: { name: trimmed } });
    const result = await updateArea({ id: areaId, name: trimmed });
    setIsRenaming(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setRenameDialogOpen(false);
  }

  return (
    <>
      <DropdownMenu open={effectiveOpen} onOpenChange={setEffectiveOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Area options"
            // Stop the pointer event from reaching the @dnd-kit listeners on
            // the parent row — clicking ⋯ should open the menu, not start drag.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={[
              "flex items-center justify-center h-5 w-5 rounded",
              "text-muted-foreground hover:bg-accent hover:text-foreground",
              "opacity-0 group-hover/area:opacity-100",
              "data-[state=open]:opacity-100 transition-opacity",
              "focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring outline-none",
            ].join(" ")}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onSelect={() => {
              setEffectiveOpen(false);
              setRenameName(areaName);
              setRenameDialogOpen(true);
            }}
          >
            Rename
          </DropdownMenuItem>
          {isArchived ? (
            <DropdownMenuItem onSelect={handleUnarchive}>Unarchive</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={handleArchive}>Archive</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => {
              setEffectiveOpen(false);
              setDeleteDialogOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this area?</DialogTitle>
            <DialogDescription>
              This will permanently remove the area. Projects inside it will block deletion —
              archive or move them first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Never mind
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
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

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename area</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setRenameDialogOpen(false);
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
              disabled={isRenaming}
            >
              Never mind
            </Button>
            <Button onClick={handleRename} disabled={isRenaming}>
              {isRenaming ? (
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
    </>
  );
}
