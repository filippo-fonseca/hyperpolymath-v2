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
import { ExplorerItemContextMenu } from "@/components/wiki/explorer-parts/ExplorerItemContextMenu";
import { FolderIcon } from "@/components/ui/icons/FolderIcon";
import { PagePreviewCard } from "@/components/wiki/preview/PagePreviewCard";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import type { FolderProjectLink, FolderRow } from "@/lib/pages/folder-projects";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import {
  buildProjectZip,
  downloadZipFiles,
  safeFileName,
} from "@/lib/pages/markdown-export";
import { buildPagesTree, type TreeFolder } from "@/lib/pages/tree";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download, FolderPlus, Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  userId: string;
  projectId: string;
  /** SSR-hydrated page slice for this project. */
  initialPages: PageWithProjects[];
}

const STAGGER_LIMIT = 24;

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
    [projects, projectId],
  );

  // Full wiki tree (effective sets, pills) → prune to subtrees relevant here.
  const tree = useMemo(
    () => buildPagesTree(allFolders, folderLinks, allPages),
    [allFolders, folderLinks, allPages],
  );
  const relevantRoots = useMemo(
    () => pruneTreeToProject(tree.roots, projectId),
    [tree.roots, projectId],
  );

  // Loose pages linked directly to this project (no folder).
  const looseStandalone = useMemo(
    () =>
      tree.standalonePages.filter((p) =>
        p.projectLinks.some((l) => l.projectId === projectId),
      ),
    [tree.standalonePages, projectId],
  );

  const projectPages = useMemo(
    () =>
      allPages.filter((p) => p.projects.some((proj) => proj.id === projectId)),
    [allPages, projectId],
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
    [router],
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
    const files = buildProjectZip(
      allFolders,
      folderLinks,
      allPages,
      projectId,
      projectName,
    );
    downloadZipFiles(files, `${safeFileName(projectName)}-docs.zip`);
  }

  const hasContent = items.length > 0;
  const hasExportablePages =
    projectPages.length > 0 || relevantRoots.length > 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          aria-controls="project-pages-body"
          className={cn(
            "group flex items-center gap-2 -ml-1 rounded-[6px] px-1 py-1 cursor-pointer",
            "transition-[background-color,color] duration-[120ms] ease-out hover:bg-[var(--sd-hover)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hud-cyan)] focus-visible:ring-offset-0",
          )}
        >
          <span className="text-[var(--sd-ink-dull)] transition-colors group-hover:text-[var(--sd-ink)]">
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </span>
          <h2 className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--sd-ink-dull)] transition-colors group-hover:text-[var(--sd-ink)]">
            Wiki
          </h2>
          <span className="font-mono text-[0.68rem] tabular-nums text-[var(--sd-ink-dull)]">
            ({projectPages.length})
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
        <div
          id="project-pages-body"
          className="overflow-hidden rounded-[10px] border border-[var(--sd-line)] bg-[var(--sd-box)]"
        >
          <div className="p-4">
            {!hasContent ? (
              <EmptyProjectPages
                onNewPage={handleNewPage}
                onNewFolder={() => setNewFolderOpen(true)}
                creating={creating}
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
                    const delay = reduceMotion ? 0 : Math.min(index, STAGGER_LIMIT) * 0.01;
                    return (
                      <motion.div
                        key={id}
                        layout={!reduceMotion}
                        initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          transition: { duration: 0.18, delay, ease: "easeOut" },
                        }}
                        exit={
                          reduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, y: 4, transition: { duration: 0.12 } }
                        }
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
    </section>
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
          "group flex h-full min-h-[176px] cursor-pointer flex-col items-center justify-between gap-2 rounded-[10px] border p-4 text-center outline-none",
          "border-[var(--sd-line)] bg-[var(--sd-box)]",
          "transition-[background-color,border-color] duration-[120ms] ease-out",
          "hover:bg-[var(--sd-hover)]",
          "focus-visible:border-[var(--hud-cyan)]",
          selected && "border-[var(--hud-cyan)] bg-[var(--sd-selected)]",
        )}
      >
        <FolderIcon size={72} variant="closed" />
        <div className="min-w-0 space-y-0.5">
          <div className="truncate font-sans text-[0.82rem] font-medium text-[var(--sd-ink)]">
            {item.folder.name}
          </div>
          <div className="font-mono text-[0.65rem] uppercase tracking-[0.06em] text-[var(--sd-ink-dull)]">
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
      className="cursor-pointer rounded-[8px] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--hud-cyan)]"
    >
      <PagePreviewCard
        page={item.page}
        icon={item.page.emoji ?? null}
        selected={selected}
      />
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
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-box)] px-2 text-[0.75rem] text-[var(--sd-ink)] cursor-pointer",
        "transition-[background-color,border-color] duration-[120ms] ease-out hover:bg-[var(--sd-hover)]",
        "focus-visible:outline-none focus-visible:border-[var(--hud-cyan)]",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function EmptyProjectPages({
  onNewPage,
  onNewFolder,
  creating,
}: {
  onNewPage: () => void;
  onNewFolder: () => void;
  creating: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-[var(--sd-line)] px-6 py-10 text-center">
      <FolderIcon size={64} variant="closed" />
      <p className="font-sans text-[15px] italic text-[var(--sd-ink-dull)]">
        No pages here yet. Add a page or folder to keep notes, meeting logs, or reference docs.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <ChromeButton
          onClick={onNewPage}
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
        <ChromeButton
          onClick={onNewFolder}
          icon={<FolderPlus size={12} strokeWidth={1.8} />}
          label="New folder"
        />
      </div>
    </div>
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
        pages: node.pages.filter((p) =>
          p.projectLinks.some((l) => l.projectId === projectId),
        ),
      });
    }
  }
  return out;
}
