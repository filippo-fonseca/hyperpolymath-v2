"use client";

import { getFoldersForCurrentUser, getSidebarTreeForCurrentUser } from "@/app/actions/folders";
import { createPage, getPagesForCurrentUser } from "@/app/actions/pages";
import type { FolderRow } from "@/lib/db/queries/folders";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { buildPagesTree, type TreePage } from "@/lib/pages/tree";
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
  initialTree: SidebarArea[];
}

/**
 * /pages home. Renders the wiki as an Area > Project > Folder > Page tree,
 * with loose (unfiled-in-project) pages directly under their project and a
 * top-level Unfiled group for pages linked to no project. A title filter
 * narrows the tree live.
 */
export function PagesListClient({ userId, initialPages, initialFolders, initialTree }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
  const { data: folders = [] } = useQuery({
    queryKey: tableKey("page_folders", userId),
    queryFn: () => getFoldersForCurrentUser(),
    initialData: initialFolders,
  });
  const { data: tree = [] } = useQuery({
    queryKey: ["pages-sidebar-tree", userId],
    queryFn: () => getSidebarTreeForCurrentUser(),
    initialData: initialTree,
  });

  const q = filter.trim().toLowerCase();
  const visiblePages = useMemo(
    () => (q ? allPages.filter((p) => p.title.toLowerCase().includes(q)) : allPages),
    [allPages, q]
  );

  const pagesTree = useMemo(
    () => buildPagesTree(tree, folders, visiblePages),
    [tree, folders, visiblePages]
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
      if (result.success) router.push(`/pages/${result.data.id}`);
    } finally {
      setCreating(false);
    }
  }

  const isEmpty = pagesTree.areas.length === 0 && pagesTree.unfiled.length === 0;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-mono text-[13px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
          Pages
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
          {pagesTree.areas.map((area) => {
            const areaKey = `area:${area.id}`;
            const areaOpen = !collapsed.has(areaKey);
            return (
              <div key={area.id} className="flex flex-col">
                <Row
                  depth={0}
                  open={areaOpen}
                  onToggle={() => toggle(areaKey)}
                  icon={<span className="text-[13px] leading-none">{area.emoji ?? "🗂️"}</span>}
                  label={area.name}
                  labelClass="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]"
                />
                {areaOpen &&
                  area.projects.map((proj) => {
                    const projKey = `proj:${proj.id}`;
                    const projOpen = !collapsed.has(projKey);
                    return (
                      <div key={proj.id} className="flex flex-col">
                        <Row
                          depth={1}
                          open={projOpen}
                          onToggle={() => toggle(projKey)}
                          icon={
                            <span className="text-[12px] leading-none">{proj.icon ?? "📁"}</span>
                          }
                          label={proj.name}
                          labelClass="font-serif text-[13px] text-[var(--ink)]"
                        />
                        {projOpen && (
                          <>
                            {proj.folders.map((folder) => {
                              if (q && folder.pages.length === 0) return null;
                              const folderKey = `folder:${folder.id}`;
                              const folderOpen = !collapsed.has(folderKey);
                              return (
                                <div key={folder.id} className="flex flex-col">
                                  <Row
                                    depth={2}
                                    open={folderOpen}
                                    onToggle={() => toggle(folderKey)}
                                    icon={
                                      <Folder
                                        size={13}
                                        strokeWidth={1.5}
                                        className="text-[var(--ink-muted)]"
                                      />
                                    }
                                    label={folder.name}
                                    labelClass="font-serif text-[13px] text-[var(--ink)]"
                                    count={folder.pages.length}
                                  />
                                  {folderOpen &&
                                    folder.pages.map((page) => (
                                      <PageRow
                                        key={page.id}
                                        depth={3}
                                        page={page}
                                        onOpen={() => router.push(`/pages/${page.id}`)}
                                      />
                                    ))}
                                </div>
                              );
                            })}
                            {proj.loosePages.map((page) => (
                              <PageRow
                                key={page.id}
                                depth={2}
                                page={page}
                                onOpen={() => router.push(`/pages/${page.id}`)}
                              />
                            ))}
                          </>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}

          {pagesTree.unfiled.length > 0 && (
            <div className="flex flex-col">
              <Row
                depth={0}
                open={!collapsed.has("unfiled")}
                onToggle={() => toggle("unfiled")}
                icon={<Inbox size={13} strokeWidth={1.5} className="text-[var(--ink-muted)]" />}
                label="Unfiled"
                labelClass="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]"
                count={pagesTree.unfiled.length}
              />
              {!collapsed.has("unfiled") &&
                pagesTree.unfiled.map((page) => (
                  <PageRow
                    key={page.id}
                    depth={1}
                    page={page}
                    onOpen={() => router.push(`/pages/${page.id}`)}
                  />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
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
