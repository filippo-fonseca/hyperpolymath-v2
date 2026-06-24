"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FolderRow } from "@/lib/pages/folder-projects";
import { Check, Download, FolderInput, Inbox, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

/** A folder flattened to {id, name, depth} in parent-before-child tree order. */
function flattenFolders(folders: FolderRow[]): { id: string; name: string; depth: number }[] {
  const childrenOf = new Map<string | null, FolderRow[]>();
  for (const f of folders) {
    const list = childrenOf.get(f.parentId);
    if (list) list.push(f);
    else childrenOf.set(f.parentId, [f]);
  }
  const sortByName = (a: FolderRow, b: FolderRow) => a.name.localeCompare(b.name);
  const out: { id: string; name: string; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const kids = (childrenOf.get(parentId) ?? []).slice().sort(sortByName);
    for (const k of kids) {
      out.push({ id: k.id, name: k.name, depth });
      walk(k.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/**
 * Per-page ⋯ actions for the Wiki tree: rename, move to a folder (or out to no
 * folder), export, delete. Presentational — every mutation calls back into
 * PagesListClient where the optimistic cache patches live. Rename + delete open
 * dialogs owned by the parent node, so the standalone hover-trash and the menu
 * share one confirmation.
 */
export function WikiPageMenu({
  currentFolderId,
  folders,
  onRequestRename,
  onMove,
  onExport,
  onRequestDelete,
}: {
  currentFolderId: string | null;
  folders: FolderRow[];
  onRequestRename: () => void;
  onMove: (folderId: string | null) => void;
  onExport: () => void;
  onRequestDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const flat = flattenFolders(folders);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Page options"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 p-1 rounded-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] data-[state=open]:opacity-100 transition-opacity duration-150 cursor-pointer outline-none"
        >
          <MoreHorizontal size={13} strokeWidth={1.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onSelect={() => {
            setOpen(false);
            onRequestRename();
          }}
        >
          <Pencil size={13} strokeWidth={1.5} />
          <span>Rename</span>
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderInput size={13} strokeWidth={1.5} />
            <span>Move to</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            <DropdownMenuItem
              disabled={currentFolderId === null}
              onSelect={() => {
                setOpen(false);
                onMove(null);
              }}
            >
              <Inbox size={13} strokeWidth={1.5} />
              <span>No folder</span>
              {currentFolderId === null && (
                <Check size={12} strokeWidth={2} className="ml-auto" />
              )}
            </DropdownMenuItem>
            {flat.length > 0 && <DropdownMenuSeparator />}
            {flat.map((f) => (
              <DropdownMenuItem
                key={f.id}
                disabled={f.id === currentFolderId}
                onSelect={() => {
                  setOpen(false);
                  onMove(f.id);
                }}
              >
                <span style={{ paddingLeft: f.depth * 12 }} className="truncate">
                  {f.name}
                </span>
                {f.id === currentFolderId && (
                  <Check size={12} strokeWidth={2} className="ml-auto" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

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
            onRequestDelete();
          }}
        >
          <Trash2 size={13} strokeWidth={1.5} />
          <span>Delete</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
