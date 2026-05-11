"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  children: React.ReactNode;
}

export function AreaContextMenu({
  areaId,
  areaName,
  isArchived,
  children,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState(areaName);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setOpen(true);
  }

  function handleArchive() {
    setOpen(false);
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
    setOpen(false);
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
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <div onContextMenu={handleContextMenu} className="w-full">
            {children}
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
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
              setOpen(false);
              setDeleteDialogOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete confirmation dialog */}
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

      {/* Rename dialog */}
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
