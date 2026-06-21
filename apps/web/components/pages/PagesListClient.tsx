"use client";

import {
  getFolderProjectsForCurrentUser,
  getFoldersForCurrentUser,
} from "@/app/actions/folders";
import { createPage, getPagesForCurrentUser } from "@/app/actions/pages";
import type { FolderProjectLink, FolderRow } from "@/lib/pages/folder-projects";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import { buildPagesTree, type TreeFolder, type TreePage } from "@/lib/pages/tree";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, FileText, Folder, Inbox, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface Props {
  userId: string;
  initialPages: PageWithProjects[];
  initialFolders: FolderRow[];
  initialFolderProjects: FolderProjectLink[];
}

/**
 * /wiki home. Renders the wiki as a project-independent folder hierarchy
 * (Phase 21): root folders, subfolders, pages, plus a top-level Standalone
 * group for pages in no folder. A title filter narrows the tree live.
 */
export function PagesListClient({
  userId,
  initialPages,
  initialFolders,
  initialFolderProjects,
}: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useTableSubscription("pages", userId);
  useTableSubscription("pages_projects", userId, {
    alsoInvalidate: [tableKey("pages", userId)],
  });
  useTableSubscription("page_folders", userId);
  useTableSubscription("folder_projects", userId);

  const { data: allPages = [] } = useQuery({
    queryKey: tableKey("pages", userId),
    queryFn: () => getPagesForCurrentUser(),
    initialData: initialPages,
  });
  const { data: folders = [] } = useQuery({
    queryKey: tableKey("page_folders", userId),
    queryFn: () => getFoldersForCurrentUser(),
    initialData: initialFolders,
  });
  const { data: folderProjects = [] } = useQuery({
    queryKey: tableKey("folder_projects", userId),
    queryFn: () => getFolderProjectsForCurrentUser(),
    initialData: initialFolderProjects,
  });

  const q = filter.trim().toLowerCase();
  const visiblePages = useMemo(
    () => (q ? allPages.filter((p) => p.title.toLowerCase().includes(q)) : allPages),
    [allPages, q]
  );

  const pagesTree = useMemo(
    () => buildPagesTree(folders, folderProjects, visiblePages),
    [folders, folderProjects, visiblePages]
  );

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleNewPage() {
    if (creating) return;
    setCreating(true);
    try {
      const id = crypto.randomUUID();
      const result = await createPage({ id, title: "", content: "" });
      if (result.success) router.push(`/wiki/${result.data.id}`);
    } finally {
      setCreating(false);
    }
  }

  const isEmpty =
    pagesTree.roots.length === 0 && pagesTree.standalonePages.length === 0;

  function renderFolder(folder: TreeFolder, depth: number): React.ReactNode {
    // When filtering, hide folders whose whole subtree has no matching pages.
    if (q && !folderHasVisiblePages(folder)) return null;
    const folderKey = `folder:${folder.id}`;
    const folderOpen = !collapsed.has(folderKey);
    return (
      <div key={folder.id} className="flex flex-col">
        <Row
          depth={depth}
          open={folderOpen}
          onToggle={() => toggle(folderKey)}
          icon={<Folder size={13} strokeWidth={1.5} className="text-[var(--ink-muted)]" />}
          label={folder.name}
          labelClass="font-serif text-[13px] text-[var(--ink)]"
          count={folder.pages.length}
        />
        {folderOpen && (
          <>
            {folder.subfolders.map((sub) => renderFolder(sub, depth + 1))}
            {folder.pages.map((page) => (
              <PageRow
                key={page.id}
                depth={depth + 1}
                page={page}
                onOpen={() => router.push(`/wiki/${page.id}`)}
              />
            ))}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-mono text-[13px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
          Wiki
        </h1>
        <button
          type="button"
          onClick={handleNewPage}
          disabled={creating}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[13px] font-serif text-[var(--ink)] border border-[var(--edge)] hover:bg-[var(--surface)] transition-colors duration-150 ease-out cursor-pointer disabled:opacity-50"
        >
          {creating ? (
            <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
          ) : (
            <Plus size={13} strokeWidth={1.5} />
          )}
          <span>{creating ? "Creating…" : "New page"}</span>
        </button>
      </div>

      {/* Filter */}
      <input
        type="text"
        placeholder="Filter by title..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full px-3 py-2 text-[13px] font-serif bg-transparent border border-[var(--edge)] rounded-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-muted)] transition-colors duration-150"
      />

      {/* Tree */}
      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <FileText size={28} strokeWidth={1} className="text-[var(--ink-muted)] opacity-40" />
          <p className="text-[13px] font-serif text-[var(--ink-muted)]">
            {filter
              ? "No pages match that filter."
              : "No pages yet. Create one to keep notes, docs, or references."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {pagesTree.roots.map((folder) => renderFolder(folder, 0))}

          {pagesTree.standalonePages.length > 0 && (
            <div className="flex flex-col">
              <Row
                depth={0}
                open={!collapsed.has("standalone")}
                onToggle={() => toggle("standalone")}
                icon={<Inbox size={13} strokeWidth={1.5} className="text-[var(--ink-muted)]" />}
                label="Standalone"
                labelClass="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]"
                count={pagesTree.standalonePages.length}
              />
              {!collapsed.has("standalone") &&
                pagesTree.standalonePages.map((page) => (
                  <PageRow
                    key={page.id}
                    depth={1}
                    page={page}
                    onOpen={() => router.push(`/wiki/${page.id}`)}
                  />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** True if a folder or any of its descendants holds at least one page. */
function folderHasVisiblePages(folder: TreeFolder): boolean {
  if (folder.pages.length > 0) return true;
  return folder.subfolders.some(folderHasVisiblePages);
}

const INDENT = 18;

function Row({
  depth,
  open,
  onToggle,
  icon,
  label,
  labelClass,
  count,
}: {
  depth: number;
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  label: string;
  labelClass: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="group flex items-center gap-1.5 py-1 px-1 rounded-sm hover:bg-[var(--surface)] transition-colors cursor-pointer text-left"
      style={{ paddingLeft: depth * INDENT + 4 }}
    >
      <span className="text-[var(--ink-muted)] flex-shrink-0">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
      </span>
      <span className="flex-shrink-0 w-4 text-center">{icon}</span>
      <span className={`truncate ${labelClass}`}>{label}</span>
      {count !== undefined && (
        <span className="font-mono text-[10px] tabular-nums text-[var(--ink-muted)]">{count}</span>
      )}
    </button>
  );
}

function PageRow({
  depth,
  page,
  onOpen,
}: {
  depth: number;
  page: TreePage;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex items-center gap-2 py-1 px-1 rounded-sm hover:bg-[var(--surface)] transition-colors cursor-pointer text-left"
      style={{ paddingLeft: depth * INDENT + 22 }}
    >
      <span className="flex-shrink-0 w-4 text-center text-[13px] leading-none">
        {page.emoji ?? <FileText size={13} strokeWidth={1.5} className="text-[var(--ink-muted)]" />}
      </span>
      <span className="flex-1 min-w-0 text-[13px] font-serif text-[var(--ink)] truncate">
        {page.title || <span className="text-[var(--ink-muted)] italic">Untitled page</span>}
      </span>
      <span className="flex-shrink-0 text-[10px] font-mono text-[var(--ink-muted)]">
        {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}
      </span>
    </button>
  );
}
