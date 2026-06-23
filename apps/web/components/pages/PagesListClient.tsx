"use client";

import {
  createFolder,
  deleteFolder,
  getFolderProjectsForCurrentUser,
  getFoldersForCurrentUser,
  renameFolder,
  setPageFolder,
  setParentFolder,
} from "@/app/actions/folders";
import {
  createPage,
  deletePage,
  getDailyPagesForCurrentUser,
  getPagesForCurrentUser,
  openDailyPage,
  updatePage,
} from "@/app/actions/pages";
import { getProjectsForCurrentUser } from "@/app/actions/projects";
import { JournalCalendar } from "@/components/journaling/JournalCalendar";
import { ProjectPillRow } from "@/components/pages/ProjectPill";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WikiFolderMenu } from "@/components/pages/WikiFolderMenu";
import { WikiFolderNameDialog } from "@/components/pages/WikiFolderNameDialog";
import { WikiPageMenu } from "@/components/pages/WikiPageMenu";
import type { FolderProjectLink, FolderRow } from "@/lib/pages/folder-projects";
import type { DailyPageRef, PageWithProjects } from "@/lib/db/queries/pages";
import {
  buildFolderZip,
  buildTreeZip,
  downloadTextFile,
  downloadZipFiles,
  pageToMarkdown,
  safeFileName,
} from "@/lib/pages/markdown-export";
import {
  buildChildrenMap,
  collectSubtreeIds,
  DND_ROOT_ID,
  encodeDraggableId,
  parseDraggableId,
  parseDroppableId,
  resolveMove,
  type DropTarget,
  type Move,
} from "@/lib/pages/folder-dnd";
import { buildPagesTree, type TreeFolder, type TreePage } from "@/lib/pages/tree";
import { dailyDayClickAction, dailyPageTitle } from "@/lib/pages/daily-page";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CornerLeftUp,
  Download,
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  Inbox,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface Props {
  userId: string;
  initialPages: PageWithProjects[];
  initialFolders: FolderRow[];
  initialFolderProjects: FolderProjectLink[];
  initialDailyPages: DailyPageRef[];
}

/** Callbacks + lookups threaded into the recursive folder/page nodes. */
interface TreeCtx {
  collapsed: Set<string>;
  toggle: (key: string) => void;
  q: string;
  projectNames: Map<string, string>;
  folderNames: Map<string, string>;
  openPage: (id: string) => void;
  onExportFolder: (id: string, name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onAddSubfolder: (parentId: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  folders: FolderRow[];
  pageFolderOf: Map<string, string | null>;
  onRenamePage: (id: string, title: string) => void;
  onMovePage: (pageId: string, folderId: string | null) => void;
  onExportPage: (id: string) => void;
  onDeletePage: (id: string) => void;
  canDrop: (target: DropTarget) => boolean;
  dragging: boolean;
}

/**
 * /wiki home. Renders the wiki as a project-independent folder hierarchy
 * (Phase 21): root folders, subfolders, pages, plus a top-level Standalone
 * group for pages in no folder. A title filter narrows the tree live.
 *
 * Folders are fully editable here (issue #95): create root folders + subfolders,
 * rename, delete, and drag-and-drop pages/folders between folders (or out to no
 * folder / the top level). Drag moves optimistically patch the TanStack Query
 * cache, then the Realtime echo reconciles; the pure move-resolution + cycle
 * rules live in lib/pages/folder-dnd.ts.
 */
export function PagesListClient({
  userId,
  initialPages,
  initialFolders,
  initialFolderProjects,
  initialDailyPages,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  // The Daily Pages calendar is shown by default; collapsible per WIKI-DAILY-01.
  const [dailyOpen, setDailyOpen] = useState(true);
  const [openingDay, setOpeningDay] = useState(false);
  // The calendar day the user has highlighted. Drives the "No daily page" panel
  // for a past/empty day. Starts on today.
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd"),
  );

  // Any pages change also refreshes the Daily Pages calendar (new/removed days).
  useTableSubscription("pages", userId, {
    alsoInvalidate: [["daily-pages", userId]],
  });
  useTableSubscription("pages_projects", userId, {
    alsoInvalidate: [tableKey("pages", userId)],
  });
  useTableSubscription("page_folders", userId);
  useTableSubscription("folder_projects", userId);
  useTableSubscription("projects", userId);

  const pagesKey = tableKey("pages", userId);
  const foldersKey = tableKey("page_folders", userId);

  const { data: allPages = [] } = useQuery({
    queryKey: pagesKey,
    queryFn: () => getPagesForCurrentUser(),
    initialData: initialPages,
  });
  const { data: folders = [] } = useQuery({
    queryKey: foldersKey,
    queryFn: () => getFoldersForCurrentUser(),
    initialData: initialFolders,
  });
  const { data: folderProjects = [] } = useQuery({
    queryKey: tableKey("folder_projects", userId),
    queryFn: () => getFolderProjectsForCurrentUser(),
    initialData: initialFolderProjects,
  });
  // No initialData / SSR seed for projects: this feeds the projectNames map
  // that resolves the folder + page project pills. Seeding [] with the global
  // refetchOnMount:false meant the map stayed empty on a cold load, so
  // ProjectPillRow filtered out every link (no resolvable name) and linked
  // projects never showed in the Wiki tree. Unseeded, the queryFn runs on mount.
  const { data: projects = [] } = useQuery({
    queryKey: tableKey("projects", userId),
    queryFn: () => getProjectsForCurrentUser(),
  });
  // Daily Pages (Phase 30) — drives the dotted days on the calendar. Shares the
  // "pages" realtime channel, so the subscription above already refreshes it.
  const { data: dailyPages = [] } = useQuery<DailyPageRef[]>({
    queryKey: ["daily-pages", userId],
    queryFn: () => getDailyPagesForCurrentUser(),
    initialData: initialDailyPages,
  });

  // id -> display name lookups so pills render labels, not raw uuids.
  const projectNames = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name] as const)),
    [projects]
  );
  const folderNames = useMemo(
    () => new Map(folders.map((f) => [f.id, f.name] as const)),
    [folders]
  );

  const q = filter.trim().toLowerCase();
  const visiblePages = useMemo(
    () => (q ? allPages.filter((p) => p.title.toLowerCase().includes(q)) : allPages),
    [allPages, q]
  );

  const pagesTree = useMemo(
    () => buildPagesTree(folders, folderProjects, visiblePages),
    [folders, folderProjects, visiblePages]
  );

  // Export always works on the FULL tree (every page, never the title-filtered
  // view) so a partial filter can never produce an incomplete bundle.
  const fullTree = useMemo(
    () => buildPagesTree(folders, folderProjects, allPages),
    [folders, folderProjects, allPages]
  );

  function handleExportAll() {
    const files = buildTreeZip(fullTree, allPages);
    downloadZipFiles(files, "wiki.zip");
  }

  function handleExportFolder(folderId: string, folderName: string) {
    const node = findFolder(fullTree.roots, folderId);
    if (!node) return;
    const files = buildFolderZip(node, allPages);
    downloadZipFiles(files, `${safeFileName(folderName)}.zip`);
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandFolder(folderId: string) {
    setCollapsed((prev) => {
      if (!prev.has(`folder:${folderId}`)) return prev;
      const next = new Set(prev);
      next.delete(`folder:${folderId}`);
      return next;
    });
  }

  async function handleNewPage() {
    if (creating) return;
    setCreating(true);
    try {
      const id = crypto.randomUUID();
      // Optimistically insert into the list cache before navigating into the
      // editor. Every other Wiki mutation here self-patches; this one used to
      // rely solely on the Realtime INSERT echo, so returning to /wiki after
      // creating showed a stale list until a manual refresh. createPage takes
      // our client id, so the echo reconciles onto the same row with no dupe.
      const now = new Date();
      patchPages((old) => [
        {
          id,
          title: "",
          content: "",
          contentJson: null,
          emoji: null,
          pinned: false,
          noExport: false,
          folderId: null,
          folderName: null,
          dailyDate: null,
          createdAt: now,
          updatedAt: now,
          projects: [],
        },
        ...old,
      ]);
      const result = await createPage({ id, title: "", content: "" });
      if (!result.success) {
        void queryClient.invalidateQueries({ queryKey: pagesKey });
        return;
      }
      router.push(`/wiki/${result.data.id}`);
    } finally {
      setCreating(false);
    }
  }

  // ─── Folder CRUD (optimistic patch → server action → realtime reconcile) ────

  function patchFolders(updater: (old: FolderRow[]) => FolderRow[]) {
    queryClient.setQueryData<FolderRow[]>(foldersKey, (old) => updater(old ?? []));
  }

  async function handleCreateFolder(name: string, parentId: string | null) {
    const id = crypto.randomUUID();
    patchFolders((old) => [
      ...old,
      { id, parentId, name, orderIndex: old.length },
    ]);
    if (parentId) expandFolder(parentId);
    const r = await createFolder({ id, parentId, name });
    if (!r.success) {
      toast.error(r.error);
      queryClient.invalidateQueries({ queryKey: foldersKey });
    }
  }

  async function handleRenameFolder(id: string, name: string) {
    patchFolders((old) => old.map((f) => (f.id === id ? { ...f, name } : f)));
    const r = await renameFolder({ id, name });
    if (!r.success) {
      toast.error(r.error);
      queryClient.invalidateQueries({ queryKey: foldersKey });
    }
  }

  async function handleDeleteFolder(id: string) {
    const subtree = new Set(collectSubtreeIds(id, buildChildrenMap(folders)));
    patchFolders((old) => old.filter((f) => !subtree.has(f.id)));
    const r = await deleteFolder(id);
    if (!r.success) {
      toast.error(r.error);
      queryClient.invalidateQueries({ queryKey: foldersKey });
    }
  }

  // ─── Page CRUD (optimistic patch → server action → realtime reconcile) ─────

  function patchPages(updater: (old: PageWithProjects[]) => PageWithProjects[]) {
    queryClient.setQueryData<PageWithProjects[]>(pagesKey, (old) =>
      updater(old ?? []),
    );
  }

  async function handleRenamePage(id: string, title: string) {
    patchPages((old) => old.map((p) => (p.id === id ? { ...p, title } : p)));
    const r = await updatePage({ id, title });
    if (!r.success) {
      toast.error(r.error);
      queryClient.invalidateQueries({ queryKey: pagesKey });
    }
  }

  async function handleDeletePage(id: string) {
    patchPages((old) => old.filter((p) => p.id !== id));
    const r = await deletePage(id);
    if (!r.success) {
      toast.error(r.error);
      queryClient.invalidateQueries({ queryKey: pagesKey });
    }
  }

  function handleExportPage(id: string) {
    const page = allPages.find((p) => p.id === id);
    if (!page) return;
    const md = pageToMarkdown({ id: page.id, title: page.title, content: page.content });
    downloadTextFile(md, `${safeFileName(page.title)}.md`);
  }

  // ─── Drag-and-drop ───────────────────────────────────────────────────────

  const pageFolderOf = useMemo(
    () => new Map(allPages.map((p) => [p.id, p.folderId] as const)),
    [allPages],
  );
  const folderParentOf = useMemo(
    () => new Map(folders.map((f) => [f.id, f.parentId] as const)),
    [folders],
  );
  const childrenOf = useMemo(() => buildChildrenMap(folders), [folders]);
  const moveCtx = useMemo(
    () => ({ pageFolderOf, folderParentOf, childrenOf }),
    [pageFolderOf, folderParentOf, childrenOf],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const activeDrag = activeId ? parseDraggableId(activeId) : null;
  const activeLabel = activeDrag
    ? activeDrag.kind === "folder"
      ? folderNames.get(activeDrag.id) ?? "Folder"
      : allPages.find((p) => p.id === activeDrag.id)?.title || "Untitled page"
    : null;

  function canDrop(target: DropTarget): boolean {
    if (!activeDrag) return false;
    return resolveMove(activeDrag, target, moveCtx) !== null;
  }

  async function applyMove(move: Move) {
    if (move.kind === "page") {
      queryClient.setQueryData<PageWithProjects[]>(pagesKey, (old) =>
        (old ?? []).map((p) =>
          p.id === move.pageId ? { ...p, folderId: move.folderId } : p,
        ),
      );
      if (move.folderId) expandFolder(move.folderId);
      const r = await setPageFolder({
        pageId: move.pageId,
        folderId: move.folderId,
      });
      if (!r.success) {
        toast.error(r.error);
        queryClient.invalidateQueries({ queryKey: pagesKey });
      }
    } else {
      patchFolders((old) =>
        old.map((f) =>
          f.id === move.folderId ? { ...f, parentId: move.parentId } : f,
        ),
      );
      if (move.parentId) expandFolder(move.parentId);
      const r = await setParentFolder({
        folderId: move.folderId,
        parentId: move.parentId,
      });
      if (!r.success) {
        toast.error(r.error);
        queryClient.invalidateQueries({ queryKey: foldersKey });
      }
    }
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const drag = parseDraggableId(String(active.id));
    const drop = parseDroppableId(String(over.id));
    if (!drag || !drop) return;
    const move = resolveMove(drag, drop, moveCtx);
    if (move) void applyMove(move);
  }

  // Daily Pages keyed by their date (route to existing vs. show create panel).
  const dailyByDate = useMemo(
    () => new Map(dailyPages.map((d) => [d.dailyDate, d] as const)),
    [dailyPages],
  );
  const markedDays = useMemo(
    () => new Set(dailyPages.map((d) => d.dailyDate)),
    [dailyPages],
  );
  const todayIso = format(new Date(), "yyyy-MM-dd");

  async function createAndOpen(iso: string) {
    if (openingDay) return;
    setOpeningDay(true);
    try {
      const result = await openDailyPage({ date: iso });
      if (result.success) router.push(`/wiki/${result.data.id}`);
    } finally {
      setOpeningDay(false);
    }
  }

  function handleSelectDay(iso: string) {
    setSelectedDate(iso);
    const action = dailyDayClickAction(iso, dailyByDate.get(iso)?.id);
    if (action.kind === "route") router.push(`/wiki/${action.pageId}`);
  }

  // First-open-of-day auto-create + navigation now lives app-wide in
  // <DailyAutoOpen> (issue #92, part 4), so the behavior fires from any entry
  // route, not only the Wiki home. This view keeps its manual "Today" button
  // and the per-day create panel below.

  const selectedDailyPage = dailyByDate.get(selectedDate) ?? null;

  const isEmpty =
    pagesTree.roots.length === 0 && pagesTree.standalonePages.length === 0;

  const ctx: TreeCtx = {
    collapsed,
    toggle,
    q,
    projectNames,
    folderNames,
    openPage: (id) => router.push(`/wiki/${id}`),
    onExportFolder: handleExportFolder,
    onRenameFolder: handleRenameFolder,
    onAddSubfolder: (parentId, name) => handleCreateFolder(name, parentId),
    onDeleteFolder: handleDeleteFolder,
    folders,
    pageFolderOf,
    onRenamePage: handleRenamePage,
    onMovePage: (pageId, folderId) =>
      void applyMove({ kind: "page", pageId, folderId }),
    onExportPage: handleExportPage,
    onDeletePage: handleDeletePage,
    canDrop,
    dragging: activeDrag !== null,
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-mono text-[13px] uppercase tracking-[0.08em] text-[var(--ink-muted)]">
          Wiki
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportAll}
            disabled={isEmpty}
            title="Export the entire wiki as a .zip of markdown files"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[13px] font-serif text-[var(--ink)] border border-[var(--edge)] hover:bg-[var(--surface)] transition-colors duration-150 ease-out cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={13} strokeWidth={1.5} />
            <span>Export all</span>
          </button>
          <button
            type="button"
            onClick={() => setNewFolderOpen(true)}
            title="Create a new top-level folder"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[13px] font-serif text-[var(--ink)] border border-[var(--edge)] hover:bg-[var(--surface)] transition-colors duration-150 ease-out cursor-pointer"
          >
            <FolderPlus size={13} strokeWidth={1.5} />
            <span>New folder</span>
          </button>
          <button
            type="button"
            onClick={handleNewPage}
            disabled={creating}
            aria-busy={creating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[13px] font-serif text-[var(--ink)] border border-[var(--edge)] hover:bg-[var(--surface)] transition-colors duration-150 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-wait"
          >
            {creating ? (
              <Loader2 size={13} strokeWidth={1.5} className="animate-spin" />
            ) : (
              <Plus size={13} strokeWidth={1.5} />
            )}
            <span>{creating ? "Creating…" : "New page"}</span>
          </button>
        </div>
      </div>

      {/* Daily Pages — collapsible calendar section (WIKI-DAILY-01). */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setDailyOpen((o) => !o)}
            className="flex items-center gap-1.5 cursor-pointer text-left"
            aria-expanded={dailyOpen}
          >
            <span className="text-[var(--ink-muted)] flex-shrink-0">
              {dailyOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <CalendarDays
              size={13}
              strokeWidth={1.5}
              className="text-[var(--ink-muted)] flex-shrink-0"
            />
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
              Daily Pages
            </span>
            {dailyPages.length > 0 && (
              <span className="font-mono text-[10px] tabular-nums text-[var(--ink-muted)]">
                {dailyPages.length}
              </span>
            )}
          </button>
          {dailyOpen && (
            <button
              type="button"
              onClick={() =>
                markedDays.has(todayIso)
                  ? handleSelectDay(todayIso)
                  : void createAndOpen(todayIso)
              }
              disabled={openingDay}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[12px] font-serif text-[var(--hud-cyan)] border border-[var(--edge)] hover:bg-[var(--surface)] transition-colors duration-150 ease-out cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {openingDay ? (
                <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
              ) : (
                <CalendarDays size={12} strokeWidth={1.5} />
              )}
              <span>Today</span>
            </button>
          )}
        </div>
        {dailyOpen && (
          <>
            <JournalCalendar
              selectedDate={selectedDate}
              markedDates={markedDays}
              onSelectDate={handleSelectDay}
              ariaLabel="Daily Pages calendar"
            />
            {!selectedDailyPage && (
              <div className="glass-tile flex items-center justify-between gap-3 rounded-md px-3 py-2.5">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                    No daily page
                  </span>
                  <span className="truncate text-[13px] font-serif text-[var(--ink)]">
                    {dailyPageTitle(selectedDate)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void createAndOpen(selectedDate)}
                  disabled={openingDay}
                  className="glass-button flex flex-shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1 text-[12px] font-serif text-[var(--hud-cyan)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {openingDay ? (
                    <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                  ) : (
                    <Plus size={12} strokeWidth={1.5} />
                  )}
                  <span>Create daily page</span>
                </button>
              </div>
            )}
          </>
        )}
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
              : "No pages yet. Create a folder or a page to keep notes, docs, or references."}
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          {/* Top-level / "no folder" drop zone — appears during a drag. */}
          <RootDropZone show={ctx.dragging} canDrop={canDrop({ kind: "root" })} />

          <div className="flex flex-col gap-1">
            {pagesTree.roots.map((folder) => (
              <FolderNode key={folder.id} folder={folder} depth={0} ctx={ctx} />
            ))}

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
                    <PageNode key={page.id} page={page} depth={1} ctx={ctx} />
                  ))}
              </div>
            )}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeDrag ? (
              <div className="glass-button flex items-center gap-2 rounded-md px-2.5 py-1.5 select-none cursor-grabbing font-serif text-[13px] text-[var(--ink)] shadow-lg">
                {activeDrag.kind === "folder" ? (
                  <Folder size={13} strokeWidth={1.5} className="text-[var(--ink-muted)]" />
                ) : (
                  <FileText size={13} strokeWidth={1.5} className="text-[var(--ink-muted)]" />
                )}
                <span className="truncate max-w-[220px]">{activeLabel}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <WikiFolderNameDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        title="New folder"
        submitLabel="Create"
        onSubmit={(name) => handleCreateFolder(name, null)}
      />
    </div>
  );
}

/** Depth-first search for a folder node by id across a forest of roots. */
function findFolder(nodes: TreeFolder[], id: string): TreeFolder | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findFolder(node.subfolders, id);
    if (hit) return hit;
  }
  return null;
}

/** True if a folder or any of its descendants holds at least one page. */
function folderHasVisiblePages(folder: TreeFolder): boolean {
  if (folder.pages.length > 0) return true;
  return folder.subfolders.some(folderHasVisiblePages);
}

const INDENT = 18;

// ─── Root / "no folder" drop zone ──────────────────────────────────────────

function RootDropZone({ show, canDrop }: { show: boolean; canDrop: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: DND_ROOT_ID });
  if (!show) return null;
  const active = isOver && canDrop;
  return (
    <div
      ref={setNodeRef}
      className={`mb-1 flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-[12px] font-serif transition-colors duration-100 ${
        active
          ? "border-[var(--hud-cyan)] bg-[color-mix(in_oklch,var(--hud-cyan)_12%,transparent)] text-[var(--hud-cyan)]"
          : "border-[var(--edge)] text-[var(--ink-muted)]"
      }`}
    >
      <CornerLeftUp size={13} strokeWidth={1.5} />
      <span>Move to top level (no folder)</span>
    </div>
  );
}

// ─── Folder node (draggable + droppable, recursive) ────────────────────────

function FolderNode({
  folder,
  depth,
  ctx,
}: {
  folder: TreeFolder;
  depth: number;
  ctx: TreeCtx;
}) {
  const dndId = encodeDraggableId({ kind: "folder", id: folder.id });
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: dndId });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: dndId });

  if (ctx.q && !folderHasVisiblePages(folder)) return null;

  const folderKey = `folder:${folder.id}`;
  const folderOpen = !ctx.collapsed.has(folderKey);
  const highlight = isOver && ctx.canDrop({ kind: "folder", id: folder.id });

  const folderPills = folder.projectLinks.map((l) => ({
    projectId: l.projectId,
    isInherited: l.isInherited,
    sourceFolderName: l.sourceFolder ? ctx.folderNames.get(l.sourceFolder) : undefined,
  }));

  return (
    <div className="flex flex-col">
      <div
        ref={setDropRef}
        className={`rounded-sm transition-colors duration-100 ${
          highlight
            ? "bg-[color-mix(in_oklch,var(--hud-cyan)_12%,transparent)] shadow-[inset_0_0_0_1px_var(--hud-cyan)]"
            : ""
        } ${isDragging ? "opacity-40" : ""}`}
      >
        <Row
          ref={setDragRef}
          depth={depth}
          open={folderOpen}
          onToggle={() => ctx.toggle(folderKey)}
          icon={<Folder size={13} strokeWidth={1.5} className="text-[var(--ink-muted)]" />}
          label={folder.name}
          labelClass="font-serif text-[13px] text-[var(--ink)]"
          count={folder.pages.length}
          pills={<ProjectPillRow links={folderPills} projectNames={ctx.projectNames} />}
          dragHandle={
            <span
              {...attributes}
              {...listeners}
              className="flex-shrink-0 cursor-grab active:cursor-grabbing text-[var(--ink-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label={`Drag ${folder.name}`}
            >
              <GripVertical size={13} strokeWidth={1.5} />
            </span>
          }
          trailing={
            <WikiFolderMenu
              folderId={folder.id}
              folderName={folder.name}
              onRename={ctx.onRenameFolder}
              onAddSubfolder={ctx.onAddSubfolder}
              onExport={() => ctx.onExportFolder(folder.id, folder.name)}
              onDelete={ctx.onDeleteFolder}
            />
          }
        />
      </div>
      {folderOpen && (
        <>
          {folder.subfolders.map((sub) => (
            <FolderNode key={sub.id} folder={sub} depth={depth + 1} ctx={ctx} />
          ))}
          {folder.pages.map((page) => (
            <PageNode key={page.id} page={page} depth={depth + 1} ctx={ctx} />
          ))}
        </>
      )}
    </div>
  );
}

// ─── Page node (draggable) ─────────────────────────────────────────────────

function PageNode({
  page,
  depth,
  ctx,
}: {
  page: TreePage;
  depth: number;
  ctx: TreeCtx;
}) {
  const dndId = encodeDraggableId({ kind: "page", id: page.id });
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dndId,
  });
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const currentFolderId = ctx.pageFolderOf.get(page.id) ?? null;
  const label = page.title || "Untitled page";

  return (
    <>
      <PageRow
        ref={setNodeRef}
        depth={depth}
        page={page}
        projectNames={ctx.projectNames}
        onOpen={() => ctx.openPage(page.id)}
        className={isDragging ? "opacity-40" : ""}
        dragHandle={
          <span
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-[var(--ink-muted)] opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={`Drag ${label}`}
          >
            <GripVertical size={13} strokeWidth={1.5} />
          </span>
        }
        actions={
          <>
            <button
              type="button"
              aria-label={`Delete ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                setDeleteOpen(true);
              }}
              className="flex-shrink-0 p-1 rounded-sm text-[var(--ink-muted)] hover:text-destructive hover:bg-[var(--surface)] cursor-pointer outline-none"
            >
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
            <WikiPageMenu
              currentFolderId={currentFolderId}
              folders={ctx.folders}
              onRequestRename={() => setRenameOpen(true)}
              onMove={(folderId) => ctx.onMovePage(page.id, folderId)}
              onExport={() => ctx.onExportPage(page.id)}
              onRequestDelete={() => setDeleteOpen(true)}
            />
          </>
        }
      />

      <WikiFolderNameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename page"
        initialValue={page.title}
        placeholder="Page title"
        submitLabel="Save"
        onSubmit={(title) => ctx.onRenamePage(page.id, title)}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{label}&rdquo;?</DialogTitle>
            <DialogDescription>
              This permanently removes the page and its contents. This cannot be
              undone.
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
                ctx.onDeletePage(page.id);
              }}
            >
              Delete page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Presentational rows ───────────────────────────────────────────────────

function Row({
  ref,
  depth,
  open,
  onToggle,
  icon,
  label,
  labelClass,
  count,
  pills,
  dragHandle,
  trailing,
}: {
  ref?: React.Ref<HTMLDivElement>;
  depth: number;
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  label: string;
  labelClass: string;
  count?: number;
  pills?: React.ReactNode;
  dragHandle?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      ref={ref}
      className="group flex items-center gap-1.5 py-1 px-1 rounded-sm hover:bg-[var(--surface)] transition-colors"
      style={{ paddingLeft: depth * INDENT + 4 }}
    >
      {dragHandle}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 min-w-0 flex-shrink cursor-pointer text-left"
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
      {pills && <span className="ml-1 min-w-0">{pills}</span>}
      {trailing && <span className="ml-auto flex-shrink-0">{trailing}</span>}
    </div>
  );
}

function PageRow({
  ref,
  depth,
  page,
  projectNames,
  onOpen,
  className,
  dragHandle,
  actions,
}: {
  ref?: React.Ref<HTMLDivElement>;
  depth: number;
  page: TreePage;
  projectNames: Map<string, string>;
  onOpen: () => void;
  className?: string;
  dragHandle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      ref={ref}
      className={`group flex items-center gap-2 py-1 px-1 rounded-sm hover:bg-[var(--surface)] transition-colors ${className ?? ""}`}
      style={{ paddingLeft: depth * INDENT + 4 }}
    >
      {dragHandle}
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer text-left"
      >
        <span className="flex-shrink-0 w-4 text-center text-[13px] leading-none">
          {page.emoji ?? (
            <FileText size={13} strokeWidth={1.5} className="text-[var(--ink-muted)]" />
          )}
        </span>
        <span className="min-w-0 text-[13px] font-serif text-[var(--ink)] truncate">
          {page.title || <span className="text-[var(--ink-muted)] italic">Untitled page</span>}
        </span>
      </button>
      <ProjectPillRow links={page.projectLinks} projectNames={projectNames} />
      <span className="flex-shrink-0 text-[10px] font-mono text-[var(--ink-muted)]">
        {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}
      </span>
      {actions && (
        <span className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
          {actions}
        </span>
      )}
    </div>
  );
}
