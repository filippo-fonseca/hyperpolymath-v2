"use client";

import {
  getFolderProjectsForCurrentUser,
  getFoldersForCurrentUser,
} from "@/app/actions/folders";
import {
  createPage,
  getDailyPagesForCurrentUser,
  getPagesForCurrentUser,
  openDailyPage,
} from "@/app/actions/pages";
import { getProjectsForCurrentUser } from "@/app/actions/projects";
import { JournalCalendar } from "@/components/journaling/JournalCalendar";
import { ProjectPillRow } from "@/components/pages/ProjectPill";
import type { FolderProjectLink, FolderRow } from "@/lib/pages/folder-projects";
import type { DailyPageRef, PageWithProjects } from "@/lib/db/queries/pages";
import {
  buildFolderZip,
  buildTreeZip,
  downloadZipFiles,
  safeFileName,
} from "@/lib/pages/markdown-export";
import { buildPagesTree, type TreeFolder, type TreePage } from "@/lib/pages/tree";
import { dailyPageTitle } from "@/lib/pages/daily-page";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Folder,
  Inbox,
  Loader2,
  Plus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
  const { data: projects = [] } = useQuery({
    queryKey: tableKey("projects", userId),
    queryFn: () => getProjectsForCurrentUser(),
    initialData: [],
  });
  // Daily Pages (Phase 30) — drives the dotted days on the calendar. Shares the
  // "pages" realtime channel, so the subscription above already refreshes it.
  const { data: dailyPages = [], isFetched: dailyFetched } = useQuery<
    DailyPageRef[]
  >({
    queryKey: ["daily-pages", userId],
    queryFn: () => getDailyPagesForCurrentUser(),
    initialData: [],
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
  // view) so a partial filter can never produce an incomplete bundle. The tree
  // gives the directory layout; allPages supplies each page's markdown content.
  const fullTree = useMemo(
    () => buildPagesTree(folders, folderProjects, allPages),
    [folders, folderProjects, allPages]
  );

  // WIKI-EXPORT-04: download the entire wiki as a structure-preserving .zip.
  function handleExportAll() {
    const files = buildTreeZip(fullTree, allPages);
    downloadZipFiles(files, "wiki.zip");
  }

  // WIKI-EXPORT-02: download one folder (with all descendants) as a .zip whose
  // directory layout mirrors the folder tree. Looks the folder up in the full
  // (unfiltered) tree so the bundle is complete regardless of the live filter.
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

  // Daily Pages keyed by their date, so a selected day can resolve to its
  // existing page id (route, never create) vs. show the "No daily page" panel.
  const dailyByDate = useMemo(
    () => new Map(dailyPages.map((d) => [d.dailyDate, d] as const)),
    [dailyPages],
  );

  // The set of days that already have a Daily Page — dotted on the calendar.
  const markedDays = useMemo(
    () => new Set(dailyPages.map((d) => d.dailyDate)),
    [dailyPages],
  );

  // Today as a local yyyy-MM-dd, used for both the calendar's initial selection
  // and the explicit "Today" affordance (WIKI-DAILY-01).
  const todayIso = format(new Date(), "yyyy-MM-dd");

  // Create (idempotently) a Daily Page for `iso` and route into it. Used by the
  // today-auto-open, the "Today" button, and the retroactive create button.
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

  // Clicking a calendar day NEVER auto-creates a page (the old bug). A day that
  // already has a page routes straight to it; any other day just becomes the
  // selection, surfacing the "No daily page" panel with a create button.
  function handleSelectDay(iso: string) {
    setSelectedDate(iso);
    const existing = dailyByDate.get(iso);
    if (existing) router.push(`/wiki/${existing.id}`);
  }

  // First open per day (WIKI-DAILY-02): once the Daily Pages list has actually
  // loaded from the server, if TODAY has no Daily Page yet, auto-create it and
  // open it. Gated on `dailyFetched` so we never act on the empty initialData
  // placeholder (which would wrongly auto-create even when today exists). The
  // ref makes it fire at most once; a day that already has a page is left alone
  // (no forced redirect on every Wiki visit).
  const autoOpenedToday = useRef(false);
  useEffect(() => {
    if (!dailyFetched) return;
    if (autoOpenedToday.current) return;
    if (markedDays.has(todayIso)) return; // today already exists -> stay home.
    autoOpenedToday.current = true;
    void createAndOpen(todayIso);
    // createAndOpen is stable enough for a once-per-mount auto-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyFetched, markedDays, todayIso]);

  // The page (if any) for the currently selected calendar day.
  const selectedDailyPage = dailyByDate.get(selectedDate) ?? null;

  const isEmpty =
    pagesTree.roots.length === 0 && pagesTree.standalonePages.length === 0;

  function renderFolder(folder: TreeFolder, depth: number): React.ReactNode {
    // When filtering, hide folders whose whole subtree has no matching pages.
    if (q && !folderHasVisiblePages(folder)) return null;
    const folderKey = `folder:${folder.id}`;
    const folderOpen = !collapsed.has(folderKey);
    // Resolve the folder's own/inherited links into render-ready pills, mapping
    // the inherited source folder id to its name.
    const folderPills = folder.projectLinks.map((l) => ({
      projectId: l.projectId,
      isInherited: l.isInherited,
      sourceFolderName: l.sourceFolder ? folderNames.get(l.sourceFolder) : undefined,
    }));
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
          pills={<ProjectPillRow links={folderPills} projectNames={projectNames} />}
          onExport={() => handleExportFolder(folder.id, folder.name)}
          exportLabel={`Export "${folder.name}" as a .zip of markdown files`}
        />
        {folderOpen && (
          <>
            {folder.subfolders.map((sub) => renderFolder(sub, depth + 1))}
            {folder.pages.map((page) => (
              <PageRow
                key={page.id}
                depth={depth + 1}
                page={page}
                projectNames={projectNames}
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
              // Today routes to today's page if it exists, else creates + opens
              // it (the one create the home is allowed to trigger on demand).
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
            {/* "No daily page" panel — shown for a selected day that has no page
                yet (WIKI-DAILY-02). Clicking a day never auto-creates; this is
                the explicit, retroactive create affordance. */}
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
                    projectNames={projectNames}
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

/** Depth-first search for a folder node by id across a forest of roots. */
function findFolder(nodes: TreeFolder[], id: string): TreeFolder | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findFolder(node.subfolders, id);
    if (hit) return hit;
  }
  return null;
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
  pills,
  onExport,
  exportLabel,
}: {
  depth: number;
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  label: string;
  labelClass: string;
  count?: number;
  pills?: React.ReactNode;
  onExport?: () => void;
  exportLabel?: string;
}) {
  return (
    <div
      className="group flex items-center gap-1.5 py-1 px-1 rounded-sm hover:bg-[var(--surface)] transition-colors"
      style={{ paddingLeft: depth * INDENT + 4 }}
    >
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
      {onExport && (
        <button
          type="button"
          onClick={onExport}
          title={exportLabel ?? "Export folder as Markdown"}
          className="ml-auto flex-shrink-0 p-1 rounded-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity transition-colors duration-150 cursor-pointer"
        >
          <Download size={12} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}

function PageRow({
  depth,
  page,
  projectNames,
  onOpen,
}: {
  depth: number;
  page: TreePage;
  projectNames: Map<string, string>;
  onOpen: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-2 py-1 px-1 rounded-sm hover:bg-[var(--surface)] transition-colors"
      style={{ paddingLeft: depth * INDENT + 22 }}
    >
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
    </div>
  );
}
