"use client";

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
import { WikiFolderNameDialog } from "@/components/pages/WikiFolderNameDialog";
import { Download, FolderPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

/**
 * Per-folder ⋯ actions for the Wiki home: rename, add subfolder, export, delete.
 * Presentational — every mutation is handed back to PagesListClient so the
 * optimistic cache patches live in one place next to the queries.
 */
export function WikiFolderMenu({
  folderId,
  folderName,
  onRename,
  onAddSubfolder,
  onExport,
  onDelete,
}: {
  folderId: string;
  folderName: string;
  onRename: (id: string, name: string) => void;
  onAddSubfolder: (parentId: string, name: string) => void;
  onExport: () => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Folder options for ${folderName}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 p-1 rounded-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 transition-opacity duration-150 cursor-pointer outline-none"
          >
            <MoreHorizontal size={13} strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              setRenameOpen(true);
            }}
          >
            <Pencil size={13} strokeWidth={1.5} />
            <span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              setSubOpen(true);
            }}
          >
            <FolderPlus size={13} strokeWidth={1.5} />
            <span>New subfolder</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setOpen(false);
              onExport();
            }}
          >
            <Download size={13} strokeWidth={1.5} />
            <span>Export</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => {
              setOpen(false);
              setDeleteOpen(true);
            }}
          >
            <Trash2 size={13} strokeWidth={1.5} />
            <span>Delete</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WikiFolderNameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename folder"
        initialValue={folderName}
        submitLabel="Save"
        onSubmit={(name) => onRename(folderId, name)}
      />
      <WikiFolderNameDialog
        open={subOpen}
        onOpenChange={setSubOpen}
        title={`New folder in "${folderName}"`}
        submitLabel="Create"
        onSubmit={(name) => onAddSubfolder(folderId, name)}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{folderName}&rdquo;?</DialogTitle>
            <DialogDescription>
              This removes the folder and its subfolders. Pages inside are kept —
              they move back to no folder.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteOpen(false);
                onDelete(folderId);
              }}
            >
              Delete folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
