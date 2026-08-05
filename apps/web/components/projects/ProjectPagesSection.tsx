"use client";

import {
  createFolder,
  deleteFolder,
  getFolderProjectsForCurrentUser,
  getFoldersForCurrentUser,
  renameFolder,
  setFolderProjects,
} from "@/app/actions/folders";
import { createPage, deletePage, getPagesForCurrentUser, updatePage } from "@/app/actions/pages";
import { getProjectsForCurrentUser } from "@/app/actions/projects";
import { WikiFolderNameDialog } from "@/components/pages/WikiFolderNameDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FolderIcon } from "@/components/ui/icons/FolderIcon";
import { ExplorerItemContextMenu } from "@/components/wiki/explorer-parts/ExplorerItemContextMenu";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { PagePreviewCard } from "@/components/wiki/preview/PagePreviewCard";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { FolderProjectLink, FolderRow } from "@/lib/pages/folder-projects";
import { buildProjectZip, downloadZipFiles, safeFileName } from "@/lib/pages/markdown-export";
import { type TreeFolder, buildPagesTree } from "@/lib/pages/tree";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, FolderPlus, Loader2, Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  userId: string;
  projectId: string;
  /** SSR-hydrated page slice for this project. */
  initialPages: PageWithProjects[];
}

// SDC-1 §2.7: stagger is min(i, 12) * 20ms, capped at 240ms.
const STAGGER_LIMIT = 12;

/**
 * Project-scoped wiki surface. Renders the project's relevant top-level folders
 * (effective set includes this project) and directly-linked loose pages in one
 * Drive/Explorer grid. Folders navigate to the Wiki Explorer (`/wiki?folder=`);
 * pages open the page detail. Matches the Explorer's visual language: flat
 * `--sd-*` chrome, dimensional folder icons, PagePreviewCard tiles, cyan
 * selection, hover-only background shift.
 */
export function ProjectPagesSection({ userId, projectId, initialPages }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();

  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ExplorerItem | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
  useTableSubscription("folder_projects", userId);
  useTableSubscription("projects", userId);

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
  const { data: folderLinks = [] } = useQuery({
    queryKey: tableKey("folder_projects", userId),
    queryFn: () => getFolderProjectsForCurrentUser(),
    initialData: [] as FolderProjectLink[],
  });
  const { data: projects = [] } = useQuery({
    queryKey: tableKey("projects", userId),
    queryFn: () => getProjectsForCurrentUser(),
    initialData: [],
  });

  const projectName = useMemo(
    () => projects.find((p) => p.id === projectId)?.name ?? "project",
    [projects, projectId]
  );

  // Full wiki tree (effective sets, pills) → prune to subtrees relevant here.
  const tree = useMemo(
    () => buildPagesTree(allFolders, folderLinks, allPages),
    [allFolders, folderLinks, allPages]
  );
  const relevantRoots = useMemo(
    () => pruneTreeToProject(tree.roots, projectId),
    [tree.roots, projectId]
  );

  // Loose pages linked directly to this project (no folder).
  const looseStandalone = useMemo(
    () => tree.standalonePages.filter((p) => p.projectLinks.some((l) => l.projectId === projectId)),
    [tree.standalonePages, projectId]
  );

  const projectPages = useMemo(
    () => allPages.filter((p) => p.projects.some((proj) => proj.id === projectId)),
    [allPages, projectId]
  );

  // Item counts for folder tiles (folders + pages under each subtree).
  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const walk = (nodes: TreeFolder[]): number => {
      let sum = 0;
      for (const n of nodes) {
        const own = n.pages.length + n.subfolders.length;
        counts.set(n.id, own + walk(n.subfolders));
        sum += 1;
      }
      return sum;
    };
    walk(relevantRoots);
    return counts;
  }, [relevantRoots]);

  // Grid item list: top-level folders first, then loose pages.
  const items: ExplorerItem[] = useMemo(() => {
    const acc: ExplorerItem[] = [];
    for (const folder of relevantRoots) {
      acc.push({
        kind: "folder",
        id: folder.id,
        folder: {
          id: folder.id,
          parentId: folder.parentId,
          name: folder.name,
          orderIndex: 0,
        },
        itemCount: folderCounts.get(folder.id) ?? 0,
      });
    }
    for (const page of looseStandalone) {
      const full = allPages.find((p) => p.id === page.id);
      if (full) acc.push({ kind: "page", id: page.id, page: full });
    }
    return acc;
  }, [relevantRoots, looseStandalone, folderCounts, allPages]);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: tableKey("pages", userId) });
    queryClient.invalidateQueries({ queryKey: tableKey("page_folders", userId) });
    queryClient.invalidateQueries({ queryKey: tableKey("folder_projects", userId) });
  }

  const openItem = useCallback(
    (item: ExplorerItem) => {
      if (item.kind === "folder") {
        router.push(`/wiki?folder=${item.folder.id}`);
        return;
      }
      router.push(`/wiki/${item.id}`);
    },
    [router]
  );

  async function handleNewPage() {
    if (creating) return;
    setCreating(true);
    try {
      const id = crypto.randomUUID();
      const result = await createPage({
        id,
        title: "",
        content: "",
        projectIds: [projectId],
        folderId: null,
      });
      if (result.success) router.push(`/wiki/${result.data.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateFolder(name: string) {
    const res = await createFolder({ name });
    if (res.success) {
      await setFolderProjects({ folderId: res.data.id, projectIds: [projectId] });
      invalidateAll();
    } else {
      toast.error(res.error);
    }
  }

  async function submitRename(name: string) {
    if (!renameTarget) return;
    if (renameTarget.kind === "folder") {
      const r = await renameFolder({ id: renameTarget.id, name });
      if (!r.success) toast.error(r.error);
      else invalidateAll();
    } else {
      const r = await updatePage({ id: renameTarget.id, title: name });
      if (!r.success) toast.error(r.error);
      else invalidateAll();
    }
    setRenameTarget(null);
  }

  async function handleDelete(item: ExplorerItem) {
    if (item.kind === "folder") {
      const r = await deleteFolder(item.id);
      if (!r.success) toast.error(r.error);
      else invalidateAll();
      return;
    }
    const r = await deletePage(item.id);
    if (!r.success) toast.error(r.error);
    else invalidateAll();
  }

  function handleExportDocs() {
    const files = buildProjectZip(allFolders, folderLinks, allPages, projectId, projectName);
    downloadZipFiles(files, `${safeFileName(projectName)}-docs.zip`);
  }

  const hasContent = items.length > 0;
  const hasExportablePages = projectPages.length > 0 || relevantRoots.length > 0;

  return (
    // Rendered inside a <PageScaffold.Section>, which owns the section rhythm
    // and the landmark element; this root is layout only.
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-controls="project-pages-body"
          className={cn(
            "group flex items-center gap-2 -ml-1 rounded-lg px-1 py-1 cursor-pointer",
            "transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
          )}
        >
          <span className="text-[var(--ink-faint)] transition-colors duration-[160ms] group-hover:text-[var(--ink-muted)]">
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </span>
          <h2 className="text-title font-semibold text-[var(--ink)]">Wiki</h2>
          <span className="text-micro font-medium tabular-nums text-[var(--ink-faint)]">
            {projectPages.length}
          </span>
        </button>
        {!collapsed && (
          <div className="flex items-center gap-2">
            <ChromeButton
              onClick={handleExportDocs}
              disabled={!hasExportablePages}
              title="Export this project's docs as a .zip of markdown files"
              icon={<Download size={12} strokeWidth={1.8} />}
              label="Export docs"
            />
            <ChromeButton
              onClick={() => setNewFolderOpen(true)}
              icon={<FolderPlus size={12} strokeWidth={1.8} />}
              label="New folder"
            />
            <ChromeButton
              onClick={handleNewPage}
              disabled={creating}
              busy={creating}
              icon={
                creating ? (
                  <Loader2 size={12} strokeWidth={1.8} className="animate-spin" />
                ) : (
                  <Plus size={12} strokeWidth={1.8} />
                )
              }
              label="New page"
            />
          </div>
        )}
      </div>

      {!collapsed && (
        // One border per nesting level (§2.6): the tiles carry their own
        // hairlines, so the grid sits directly on the canvas with no plate.
        <div id="project-pages-body">
          {!hasContent ? (
            <EmptyState
              size="section"
              icon={<FolderIcon size={40} variant="closed" />}
              title="No pages yet"
              description="Add a page or folder to keep notes, meeting logs, and reference docs linked to this project."
              action={{ label: "New page", onClick: handleNewPage }}
            />
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
              data-view="grid"
            >
              <AnimatePresence initial={false}>
                {items.map((item, index) => {
                  const id = `${item.kind}:${item.id}`;
                  const selected = selectedId === id;
                  const delay = reduceMotion ? 0 : Math.min(index, STAGGER_LIMIT) * 0.02;
                  return (
                    // Opacity only: layout projection and a `y` transform on
                    // the same node both write `transform`, and an interrupted
                    // animation settles off-grid (the drooping-tiles bug).
                    <motion.div
                      key={id}
                      layout={!reduceMotion}
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{
                        opacity: 1,
                        transition: { duration: 0.16, delay, ease: "easeOut" },
                      }}
                      exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.16 } }}
                    >
                      <ExplorerItemContextMenu
                        item={item}
                        onOpen={openItem}
                        onRename={setRenameTarget}
                        onDelete={handleDelete}
                      >
                        <ProjectGridTile
                          item={item}
                          selected={selected}
                          onClick={() => setSelectedId(id)}
                          onDoubleClick={() => openItem(item)}
                        />
                      </ExplorerItemContextMenu>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      <WikiFolderNameDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        title="New folder"
        submitLabel="Create"
        onSubmit={(name) => handleCreateFolder(name)}
      />
      <WikiFolderNameDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        title={renameTarget?.kind === "folder" ? "Rename folder" : "Rename page"}
        initialValue={
          renameTarget
            ? renameTarget.kind === "folder"
              ? renameTarget.folder.name
              : renameTarget.page.title
            : ""
        }
        placeholder={renameTarget?.kind === "folder" ? "Folder name" : "Page title"}
        submitLabel="Save"
        onSubmit={submitRename}
      />
    </div>
  );
}

function ProjectGridTile({
  item,
  selected,
  onClick,
  onDoubleClick,
}: {
  item: ExplorerItem;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  if (item.kind === "folder") {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-selected={selected}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onDoubleClick();
          }
        }}
        className={cn(
          "craft-card craft-card-hover group flex h-full min-h-[176px] cursor-pointer flex-col items-center justify-between gap-2 p-4 text-center",
          selected && "border-[var(--edge-strong)] bg-[var(--selected)]"
        )}
      >
        <FolderIcon size={72} variant="closed" />
        <div className="min-w-0 space-y-1">
          <div className="truncate text-meta font-semibold text-[var(--ink)]">
            {item.folder.name}
          </div>
          <div className="text-micro text-[var(--ink-faint)] tabular-nums">
            {item.itemCount === 0
              ? "Empty"
              : `${item.itemCount} item${item.itemCount === 1 ? "" : "s"}`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={selected}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDoubleClick();
        }
      }}
      className="focus-ring cursor-pointer rounded-lg"
    >
      <PagePreviewCard page={item.page} icon={item.page.emoji ?? null} selected={selected} />
    </div>
  );
}

function ChromeButton({
  onClick,
  disabled,
  busy,
  title,
  icon,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy || undefined}
      title={title}
      className="craft-chip shrink-0 cursor-pointer-always disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/**
 * Keep only the folder subtrees whose EFFECTIVE project set includes
 * `projectId`, preserving the descendant hierarchy. A folder is kept when its
 * own effective set includes the project OR any descendant qualifies (so an
 * intermediate folder is not dropped if a deeper subfolder is relevant).
 */
function pruneTreeToProject(nodes: TreeFolder[], projectId: string): TreeFolder[] {
  const out: TreeFolder[] = [];
  for (const node of nodes) {
    const prunedSubs = pruneTreeToProject(node.subfolders, projectId);
    const selfRelevant = node.effectiveProjectIds.includes(projectId);
    if (selfRelevant || prunedSubs.length > 0) {
      out.push({
        ...node,
        subfolders: prunedSubs,
        pages: node.pages.filter((p) => p.projectLinks.some((l) => l.projectId === projectId)),
      });
    }
  }
  return out;
}
