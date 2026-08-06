"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FolderRow } from "@/lib/pages/folder-projects";
import { Check, ChevronDown, Folder, FolderInput, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";

interface FolderPickerProps {
  /** All of the user's folders, from getFoldersForCurrentUser(). */
  folders: FolderRow[];
  /** The folder the page currently sits in, or null when unfiled. */
  currentFolderId: string | null;
  /** Pick an existing folder, or null to unfile the page. */
  onPick: (folderId: string | null) => void;
  /** Create a child folder under `parentId` (null = root), file the page into
   *  it, and resolve to the new folder id. */
  onCreate: (name: string, parentId: string | null) => Promise<string>;
}

interface FlatFolder {
  id: string;
  name: string;
  depth: number;
}

const INDENT = 14;

/**
 * Files a page into a folder (Phase 24). The trigger shows the current folder
 * name (or "Unfiled"); the popover lists the folder hierarchy indented by depth.
 * "Unfiled" at the top clears the page's folder. Each folder row carries a hover
 * PLUS affordance that opens an inline name input to create a CHILD folder
 * (parentId = that row's id); a root-level "+ New folder" at the bottom creates
 * with parentId = null. On create the page is filed into the new folder.
 */
export function FolderPicker({
  folders,
  currentFolderId,
  onPick,
  onCreate,
}: FolderPickerProps) {
  const [open, setOpen] = useState(false);
  // When set, an inline create input is open whose new folder nests under this
  // parent ("__root__" sentinel = create at root). null = no input open.
  const [createUnder, setCreateUnder] = useState<string | "__root__" | null>(null);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);

  // Flatten the parentId hierarchy into a depth-ordered list for indented render.
  const flat = useMemo(() => flattenFolders(folders), [folders]);

  const currentName =
    folders.find((f) => f.id === currentFolderId)?.name ?? null;

  async function commitCreate(parentId: string | null) {
    const name = draftName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onCreate(name, parentId);
      setDraftName("");
      setCreateUnder(null);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function openCreateInput(key: string | "__root__") {
    setCreateUnder(key);
    setDraftName("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
 className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-micro font-mono text-[var(--ink-muted)] border border-[var(--edge)] hover:bg-[var(--surface)] hover:text-[var(--ink)] transition-colors duration-150 cursor-pointer"
          title="File this page in a folder"
        >
          <Folder size={11} strokeWidth={1.5} />
          <span className="truncate max-w-[160px]">{currentName ?? "Unfiled"}</span>
          <ChevronDown size={11} strokeWidth={1.5} className="opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1.5 flex flex-col gap-0.5" align="start">
        {/* Unfiled option */}
        <button
          type="button"
          onClick={() => {
            onPick(null);
            setOpen(false);
          }}
 className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-sm text-micro font-serif text-[var(--ink)] hover:bg-[var(--surface)] transition-colors duration-100 cursor-pointer"
        >
          <FolderInput size={12} strokeWidth={1.5} className="text-[var(--ink-muted)] flex-shrink-0" />
          <span className="flex-1">Unfiled</span>
          {currentFolderId === null && (
            <Check size={12} strokeWidth={2} className="text-[var(--ink)] flex-shrink-0" />
          )}
        </button>

        <div className="my-0.5 h-px bg-[var(--edge)]" />

        {/* Folder hierarchy */}
        <div className="flex flex-col gap-0.5 max-h-[280px] overflow-y-auto">
          {flat.map((folder) => (
            <div key={folder.id} className="flex flex-col">
              <div
                className="group/folder flex items-center gap-1 rounded-sm hover:bg-[var(--surface)] transition-colors duration-100"
                style={{ paddingLeft: folder.depth * INDENT }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onPick(folder.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left px-2 py-1.5 cursor-pointer"
                >
                  <Folder
                    size={12}
                    strokeWidth={1.5}
                    className="text-[var(--ink-muted)] flex-shrink-0"
                  />
 <span className="flex-1 truncate text-micro font-serif text-[var(--ink)]">
                    {folder.name}
                  </span>
                  {currentFolderId === folder.id && (
                    <Check size={12} strokeWidth={2} className="text-[var(--ink)] flex-shrink-0" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => openCreateInput(folder.id)}
                  title="New subfolder here"
                  className="flex-shrink-0 mr-1 flex items-center justify-center w-5 h-5 rounded-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-raised)] opacity-0 group-hover/folder:opacity-100 transition-opacity cursor-pointer"
                >
                  <Plus size={11} strokeWidth={1.5} />
                </button>
              </div>
              {createUnder === folder.id && (
                <InlineCreate
                  indent={(folder.depth + 1) * INDENT}
                  value={draftName}
                  busy={busy}
                  onChange={setDraftName}
                  onCommit={() => commitCreate(folder.id)}
                  onCancel={() => setCreateUnder(null)}
                />
              )}
            </div>
          ))}
          {flat.length === 0 && (
 <p className="px-2 py-1.5 text-micro font-serif italic text-[var(--ink-muted)]">
              No folders yet.
            </p>
          )}
        </div>

        <div className="my-0.5 h-px bg-[var(--edge)]" />

        {/* Root-level new folder */}
        {createUnder === "__root__" ? (
          <InlineCreate
            indent={0}
            value={draftName}
            busy={busy}
            onChange={setDraftName}
            onCommit={() => commitCreate(null)}
            onCancel={() => setCreateUnder(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() => openCreateInput("__root__")}
 className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-sm text-micro font-mono text-[var(--ink-muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer"
          >
            <Plus size={12} strokeWidth={1.5} className="flex-shrink-0" />
            New folder
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function InlineCreate({
  indent,
  value,
  busy,
  onChange,
  onCommit,
  onCancel,
}: {
  indent: number;
  value: string;
  busy: boolean;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-1 py-1" style={{ paddingLeft: indent }}>
      <input
        // biome-ignore lint/a11y/noAutofocus: intentional focus when input opens
        autoFocus
        type="text"
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Folder name..."
 className="flex-1 min-w-0 px-2 py-1 text-micro font-serif bg-transparent border border-[var(--edge)] rounded-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-muted)] disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onCommit}
        disabled={busy}
        title="Create folder"
        className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors cursor-pointer disabled:opacity-50"
      >
        <Check size={12} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        onClick={onCancel}
        title="Cancel"
        className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
      >
        <X size={12} strokeWidth={1.5} />
      </button>
    </div>
  );
}

/**
 * Flatten folders into a depth-ordered list (parent before children, siblings in
 * input order). Cycle-safe via a visited set; orphaned folders (parent missing)
 * surface at the root so they are never silently dropped.
 */
function flattenFolders(folders: FolderRow[]): FlatFolder[] {
  const childrenOf = new Map<string | null, FolderRow[]>();
  const ids = new Set(folders.map((f) => f.id));
  for (const f of folders) {
    // Treat a folder whose parent is missing as a root so it stays reachable.
    const key = f.parentId && ids.has(f.parentId) ? f.parentId : null;
    const list = childrenOf.get(key) ?? [];
    list.push(f);
    childrenOf.set(key, list);
  }

  const out: FlatFolder[] = [];
  const visited = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const f of childrenOf.get(parent) ?? []) {
      if (visited.has(f.id)) continue;
      visited.add(f.id);
      out.push({ id: f.id, name: f.name, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
