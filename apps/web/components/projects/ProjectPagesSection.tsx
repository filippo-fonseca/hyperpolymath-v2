"use client";

import {
  createFolder,
  deleteFolder,
  getFoldersForCurrentUser,
  renameFolder,
  setPageFolder,
} from "@/app/actions/folders";
import { createPage, getPagesForCurrentUser } from "@/app/actions/pages";
import type { FolderRow } from "@/lib/db/queries/folders";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface Props {
  userId: string;
  projectId: string;
  /** SSR-hydrated page slice for this project. */
  initialPages: PageWithProjects[];
}

/**
 * Project-scoped pages surface. Same data model as /pages, filtered to pages
 * linked to THIS project. Pages are grouped by the folder they sit in for this
 * project-link (folder placement is per project-link, so a page can be loose
 * here yet filed elsewhere). Folders are created/renamed/deleted within the
 * project; "+ New page" creates a page pre-linked to this project (optionally
 * into a folder).
 */
export function ProjectPagesSection({ userId, projectId, initialPages }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCollapsed(localStorage.getItem("project-pages-collapsed") === "true");
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined")
      localStorage.setItem("project-pages-collapsed", String(collapsed));
  }, [collapsed]);

  useTableSubscription("pages", userId);
  useTableSubscription("pages_projects", userId, {
    alsoInvalidate: [tableKey("pages", userId)],
  });
  useTableSubscription("page_folders", userId);

  const { data: allPages = [] } = useQuery({
    queryKey: tableKey("pages", userId),
    queryFn: () => getPagesForCurrentUser(),
    initialData: initialPages,
  });
  const { data: allFolders = [] } = useQuery({
    queryKey: tableKey("page_folders", userId),
    queryFn: () => getFoldersForCurrentUser(),
    initialData: [] as FolderRow[],
  });

  const folders = useMemo(
    () => allFolders.filter((f) => f.projectId === projectId),
    [allFolders, projectId]
  );

  const projectPages = useMemo(
    () => allPages.filter((p) => p.projects.some((proj) => proj.id === projectId)),
    [allPages, projectId]
  );

  // Group this project's pages by their folder for THIS project-link.
  const { byFolder, loose } = useMemo(() => {
    const folderIds = new Set(folders.map((f) => f.id));
    const byFolder = new Map<string, PageWithProjects[]>();
    const loose: PageWithProjects[] = [];
    for (const page of projectPages) {
      const link = page.projects.find((p) => p.id === projectId);
      const fid = link?.folderId ?? null;
      if (fid && folderIds.has(fid)) {
        const list = byFolder.get(fid) ?? [];
        list.push(page);
        byFolder.set(fid, list);
      } else {
        loose.push(page);
      }
    }
    return { byFolder, loose };
  }, [projectPages, folders, projectId]);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: tableKey("pages", userId) });
    queryClient.invalidateQueries({ queryKey: tableKey("page_folders", userId) });
  }

  function toggleFolder(id: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleNewPage(folderId: string | null) {
    if (creating) return;
    setCreating(true);
    try {
      const id = crypto.randomUUID();
      const result = await createPage({
        id,
        title: "",
        content: "",
        projectIds: [projectId],
        folderId,
      });
      if (result.success) router.push(`/pages/${result.data.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setNewFolderName("");
    setShowNewFolder(false);
    const res = await createFolder({ projectId, name });
    if (res.success) invalidateAll();
  }

  async function handleRename(id: string) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    const res = await renameFolder({ id, name });
    if (res.success) invalidateAll();
  }

  async function handleDeleteFolder(id: string) {
    const res = await deleteFolder(id);
    if (res.success) invalidateAll();
  }

  async function handleMovePage(pageId: string, folderId: string | null) {
    const res = await setPageFolder({ pageId, projectId, folderId });
    if (res.success) invalidateAll();
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-controls="project-pages-body"
          className="group flex items-center gap-2 -ml-1 px-1 py-1 rounded-sm hover:bg-[var(--surface)] transition-colors cursor-pointer"
        >
          <span className="text-[var(--ink-muted)] group-hover:text-[var(--ink)] transition-colors">
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </span>
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)] group-hover:text-[var(--ink)] transition-colors">
            Pages
          </h2>
          <span className="font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
            ({projectPages.length})
          </span>
        </button>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowNewFolder(true);
                setNewFolderName("");
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[12px] font-serif text-[var(--ink)] border border-[var(--edge)] hover:bg-[var(--surface)] transition-colors duration-150 ease-out cursor-pointer"
            >
              <FolderPlus size={12} strokeWidth={1.5} />
              <span>New folder</span>
            </button>
            <button
              type="button"
              onClick={() => handleNewPage(null)}
              disabled={creating}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[12px] font-serif text-[var(--ink)] border border-[var(--edge)] hover:bg-[var(--surface)] transition-colors duration-150 ease-out cursor-pointer disabled:opacity-50"
            >
              <Plus size={12} strokeWidth={1.5} />
              <span>New page</span>
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <div id="project-pages-body" className="flex flex-col gap-3">
          {showNewFolder && (
            <div className="flex items-center gap-2">
              <Folder size={13} strokeWidth={1.5} className="text-[var(--ink-muted)] flex-shrink-0" />
              <input
                // biome-ignore lint/a11y/noAutofocus: intentional focus on reveal
                autoFocus
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") {
                    setShowNewFolder(false);
                    setNewFolderName("");
                  }
                }}
                placeholder="Folder name…"
                className="flex-1 px-2 py-1 text-[13px] font-serif bg-transparent border border-[var(--edge)] rounded-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-muted)]"
              />
              <IconBtn label="Create folder" onClick={handleCreateFolder}>
                <Check size={13} strokeWidth={1.5} />
              </IconBtn>
              <IconBtn
                label="Cancel"
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName("");
                }}
              >
                <X size={13} strokeWidth={1.5} />
              </IconBtn>
            </div>
          )}

          {projectPages.length === 0 && folders.length === 0 ? (
            <EmptyPages />
          ) : (
            <div className="flex flex-col gap-2">
              {folders.map((folder) => {
                const pagesIn = byFolder.get(folder.id) ?? [];
                const open = !collapsedFolders.has(folder.id);
                const isRenaming = renamingId === folder.id;
                return (
                  <div key={folder.id} className="flex flex-col">
                    <div className="group/folder flex items-center gap-2 py-1 px-1 rounded-sm hover:bg-[var(--surface)] transition-colors">
                      <button
                        type="button"
                        onClick={() => toggleFolder(folder.id)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                      >
                        <span className="text-[var(--ink-muted)] flex-shrink-0">
                          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </span>
                        <Folder
                          size={13}
                          strokeWidth={1.5}
                          className="text-[var(--ink-muted)] flex-shrink-0"
                        />
                        {isRenaming ? (
                          <input
                            // biome-ignore lint/a11y/noAutofocus: intentional focus on rename
                            autoFocus
                            type="text"
                            value={renameValue}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRename(folder.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            className="flex-1 min-w-0 px-1.5 py-0.5 text-[13px] font-serif bg-transparent border border-[var(--edge)] rounded-sm text-[var(--ink)] focus:outline-none focus:border-[var(--ink-muted)]"
                          />
                        ) : (
                          <span className="flex-1 min-w-0 text-[13px] font-serif text-[var(--ink)] truncate">
                            {folder.name}
                          </span>
                        )}
                        <span className="font-mono text-[10px] tabular-nums text-[var(--ink-muted)] flex-shrink-0">
                          {pagesIn.length}
                        </span>
                      </button>
                      <div className="flex items-center gap-1 opacity-0 group-hover/folder:opacity-100 transition-opacity flex-shrink-0">
                        {isRenaming ? (
                          <>
                            <IconBtn label="Save name" onClick={() => handleRename(folder.id)}>
                              <Check size={12} strokeWidth={1.5} />
                            </IconBtn>
                            <IconBtn label="Cancel rename" onClick={() => setRenamingId(null)}>
                              <X size={12} strokeWidth={1.5} />
                            </IconBtn>
                          </>
                        ) : (
                          <>
                            <IconBtn label="New page in folder" onClick={() => handleNewPage(folder.id)}>
                              <Plus size={12} strokeWidth={1.5} />
                            </IconBtn>
                            <IconBtn
                              label="Rename folder"
                              onClick={() => {
                                setRenamingId(folder.id);
                                setRenameValue(folder.name);
                              }}
                            >
                              <Pencil size={12} strokeWidth={1.5} />
                            </IconBtn>
                            <IconBtn label="Delete folder" onClick={() => handleDeleteFolder(folder.id)}>
                              <Trash2 size={12} strokeWidth={1.5} />
                            </IconBtn>
                          </>
                        )}
                      </div>
                    </div>
                    {open && (
                      <div className="flex flex-col pl-6">
                        {pagesIn.length === 0 ? (
                          <p className="py-1.5 px-2 text-[12px] font-serif italic text-[var(--ink-muted)]">
                            Empty folder.
                          </p>
                        ) : (
                          pagesIn.map((page) => (
                            <PageRow
                              key={page.id}
                              page={page}
                              folders={folders}
                              currentFolderId={folder.id}
                              onOpen={() => router.push(`/pages/${page.id}`)}
                              onMove={(fid) => handleMovePage(page.id, fid)}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {loose.length > 0 && (
                <div className="flex flex-col">
                  {folders.length > 0 && (
                    <p className="py-1 px-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                      Unfiled
                    </p>
                  )}
                  {loose.map((page) => (
                    <PageRow
                      key={page.id}
                      page={page}
                      folders={folders}
                      currentFolderId={null}
                      onOpen={() => router.push(`/pages/${page.id}`)}
                      onMove={(fid) => handleMovePage(page.id, fid)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PageRow({
  page,
  folders,
  currentFolderId,
  onOpen,
  onMove,
}: {
  page: PageWithProjects;
  folders: FolderRow[];
  currentFolderId: string | null;
  onOpen: () => void;
  onMove: (folderId: string | null) => void;
}) {
  return (
    <div className="group/row flex items-center gap-2 py-1.5 px-2 rounded-sm hover:bg-[var(--surface)] transition-colors duration-100">
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer"
      >
        <span className="w-4 flex-shrink-0 text-center text-[14px] leading-none">
          {page.emoji ? (
            <span>{page.emoji}</span>
          ) : (
            <FileText size={14} strokeWidth={1.5} className="text-[var(--ink-muted)]" />
          )}
        </span>
        <span className="flex-1 min-w-0 text-[13px] font-serif text-[var(--ink)] truncate">
          {page.title || <span className="text-[var(--ink-muted)] italic">Untitled page</span>}
        </span>
      </button>
      <select
        value={currentFolderId ?? ""}
        onChange={(e) => onMove(e.target.value === "" ? null : e.target.value)}
        aria-label="Move page to folder"
        className="flex-shrink-0 max-w-[8rem] text-[11px] font-mono bg-transparent border border-transparent group-hover/row:border-[var(--edge)] rounded-sm px-1 py-0.5 text-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-muted)] cursor-pointer"
      >
        <option value="">No folder</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <span className="flex-shrink-0 text-[11px] font-mono text-[var(--ink-muted)]">
        {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}
      </span>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex items-center justify-center w-6 h-6 rounded-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}

function EmptyPages() {
  return (
    <div className="rounded-md border border-dashed border-[var(--edge)] px-5 py-6 text-center">
      <p className="font-serif italic text-[15px] text-[var(--ink-muted)]">
        No pages yet. Add one to keep notes, meeting logs, or reference docs for this project.
      </p>
    </div>
  );
}
