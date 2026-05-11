"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  archiveArea,
  unarchiveArea,
  deleteArea,
  updateArea,
} from "@/app/actions/areas";

interface Props {
  areaId: string;
  areaName: string;
  isArchived: boolean;
  /** External "open" trigger from a right-click on the row. Optional. */
  rightClickOpen?: boolean;
  onRightClickClose?: () => void;
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
}: Props) {
  const router = useRouter();
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
    startTransition(async () => {
      const result = await archiveArea(areaId);
      if (!result.success) {
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
              } else {
                router.refresh();
              }
            });
          },
        },
        duration: 4000,
      });
      router.refresh();
    });
  }

  function handleUnarchive() {
    setEffectiveOpen(false);
    startTransition(async () => {
      const result = await unarchiveArea(areaId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function handleDelete() {
    setIsDeleting(true);
    const result = await deleteArea(areaId);
    setIsDeleting(false);
    if (!result.success) {
      toast.error(result.error);
      setDeleteDialogOpen(false);
      return;
    }
    toast("Area deleted.");
    setDeleteDialogOpen(false);
    router.refresh();
  }

  async function handleRename() {
    if (!renameName.trim() || renameName.trim() === areaName) {
      setRenameDialogOpen(false);
      return;
    }
    setIsRenaming(true);
    const result = await updateArea({ id: areaId, name: renameName.trim() });
    setIsRenaming(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setRenameDialogOpen(false);
    router.refresh();
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
            <DropdownMenuItem onSelect={handleUnarchive}>
              Unarchive
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={handleArchive}>
              Archive
            </DropdownMenuItem>
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
              This will permanently remove the area. Projects inside it will
              block deletion — archive or move them first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Never mind
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete area"}
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
            >
              Never mind
            </Button>
            <Button onClick={handleRename} disabled={isRenaming}>
              {isRenaming ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
