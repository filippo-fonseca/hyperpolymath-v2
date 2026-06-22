"use client";

import {
  createFolder,
  getFolderProjectsForCurrentUser,
  getFoldersForCurrentUser,
  getSidebarTreeForCurrentUser,
  setPageFolder,
} from "@/app/actions/folders";
import {
  deletePage,
  getPagesForCurrentUser,
  setPageNoExport,
  updatePage,
} from "@/app/actions/pages";
import { getPeopleForCurrentUser, reconcilePersonReferences } from "@/app/actions/people";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { PersonWithStats } from "@/lib/db/queries/people";
import { invokeInDocumentJarvis } from "@/lib/jarvis/invoke-in-document";
import { formatReceiptSummary } from "@/lib/jarvis/receipt-summary";
import {
  type FolderProjectLink,
  type FolderRow,
  type FolderWithProjects,
  buildPageProjectPills,
  getEffectiveProjectIds,
} from "@/lib/pages/folder-projects";
import { downloadTextFile, pageToMarkdown, safeFileName } from "@/lib/pages/markdown-export";
import { useInPageSearch } from "@/lib/pages/useInPageSearch";
import { extractPersonIdsFromBlockNote } from "@/lib/people/extract-mentions";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  CalendarDays,
  Check,
  Download,
  Eye,
  EyeOff,
  FileText,
  Globe,
  GlobeLock,
  Loader2,
  Lock,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FolderPicker } from "./FolderPicker";
import { PageSearchBar } from "./PageSearchBar";
import { ProjectLinker } from "./ProjectLinker";

// BlockNote needs the browser DOM — load client-only.
const PageBlockEditor = dynamic(() => import("./PageBlockEditor"), { ssr: false });

interface ActiveProject {
  id: string;
  name: string;
  icon: string | null;
  isClass: boolean;
  courseCode: string | null;
  areaName: string | null;
  areaEmoji: string | null;
}

interface Props {
  userId: string;
  page: PageWithProjects;
  initialActiveProjects: ActiveProject[];
}

const AUTOSAVE_DELAY = 1500;

/**
 * /wiki/[pageId] client island. Notion-style BlockNote editor with 1.5s
 * autosave, emoji picker, project link management, and delete.
 */
export function PageDetailClient({ userId, page: initialPage, initialActiveProjects }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();

  useTableSubscription("pages", userId);
  useTableSubscription("pages_projects", userId, {
    alsoInvalidate: [tableKey("pages", userId)],
  });
  useTableSubscription("page_folders", userId, {
    alsoInvalidate: [tableKey("pages", userId)],
  });
  useTableSubscription("folder_projects", userId);

  const { data: allPages = [] } = useQuery({
    queryKey: tableKey("pages", userId),
    queryFn: () => getPagesForCurrentUser(),
    initialData: [initialPage],
  });
  // Areas + projects (incl. archived) drive the Area-grouped ProjectLinker.
  const { data: areas = [] } = useQuery({
    queryKey: ["sidebar-tree", userId],
    queryFn: () => getSidebarTreeForCurrentUser(),
    initialData: [],
  });
  // Folders + their direct project links resolve the page's inherited pills and
  // feed the FolderPicker's hierarchy.
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

  // People feed the `@`-mention menu in the editor; people_references keeps the
  // mention counts live. Mirrors PeopleClient's query + dual subscription so the
  // menu reflects inline-created people (and external edits) without a reload.
  const { data: people = [] } = useQuery({
    queryKey: tableKey("people", userId),
    queryFn: getPeopleForCurrentUser,
    initialData: [] as PersonWithStats[],
  });
  useTableSubscription("people", userId);
  useTableSubscription("people_references", userId, {
    alsoInvalidate: [tableKey("people", userId)],
  });

  // After the `@` menu inline-creates a person, refetch so it's mentionable
  // again immediately (the create lands before Realtime echoes the new row).
  const refreshPeople = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: tableKey("people", userId) });
  }, [queryClient, userId]);

  const serverPage = allPages.find((p) => p.id === initialPage.id) ?? initialPage;

  // Local edit state. `content` is the markdown mirror; `contentJson` is the
  // BlockNote document (source of truth). Both move together on every edit.
  const [title, setTitle] = useState(serverPage.title);
  const [content, setContent] = useState(serverPage.content);
  const [contentJson, setContentJson] = useState<unknown>(serverPage.contentJson);
  const [emoji, setEmoji] = useState<string | null>(serverPage.emoji);
  const [linkedProjectIds, setLinkedProjectIds] = useState<string[]>(
    serverPage.projects.map((p) => p.id)
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [emojiInput, setEmojiInput] = useState(serverPage.emoji ?? "");
  const [emojiOpen, setEmojiOpen] = useState(false);
  // Local-only toggle for the per-doc nav bar. JARVIS receipts get wired in
  // Phase 32, so there is nothing to hide yet; this just builds the control and
  // its on/off state. Not persisted to the DB (no hideReceipts column exists).
  const [hideReceipts, setHideReceipts] = useState(false);
  // Knowledge-graph gate (Phase 29). `noExport` excludes this page from the
  // context snapshot, MCP export, and JARVIS knowledge graph. Optimistic local
  // mirror of pages.no_export; the serverPage value (TanStack Query + realtime)
  // is the source of truth and re-syncs this on any external change.
  const [noExport, setNoExportState] = useState(serverPage.noExport);
  useEffect(() => {
    setNoExportState(serverPage.noExport);
  }, [serverPage.noExport]);
  // In-page find (Phase 26). Opens via Cmd+F over the editor or the nav-bar
  // Search button; highlights matches through the CSS Custom Highlight API.
  const [searchOpen, setSearchOpen] = useState(false);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const editorFocusRef = useRef<(() => void) | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  // The live BlockNote editor, captured via PageBlockEditor.onEditorReady. Used
  // by the Daily Page "process this page" button to run the WHOLE page through
  // the in-document JARVIS engine (Phase 30, WIKI-DAILY-04). Held as `unknown`
  // and cast at the invoke call site, exactly like PageBlockEditor does — the
  // BlockNote editor's heavily-generic serializer signature is wider than the
  // structural InvokeEditor surface, so a direct assignment would not narrow.
  const editorRef = useRef<unknown>(null);
  // True = a Daily Page (drives the pill + process button). NULL daily_date is
  // a normal page; a non-NULL date marks the user's Daily Page for that day.
  const isDailyPage = serverPage.dailyDate !== null;
  const [processing, setProcessing] = useState(false);

  /**
   * Run the whole Daily Page through the shared in-document JARVIS engine to
   * extract a daily plan (tasks / events / captures). Forces page scope so the
   * cursor position never matters; the turn persists server-side and surfaces
   * in the JARVIS conversation tab via realtime. Result is summarized in a toast.
   */
  // Stable so PageBlockEditor's onEditorReady effect doesn't re-run each render.
  const handleEditorReady = useCallback((editor: unknown) => {
    editorRef.current = editor;
  }, []);

  const handleProcessDailyPage = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || processing) return;
    setProcessing(true);
    const pending = toast.loading("Processing this daily page…");
    try {
      const result = await invokeInDocumentJarvis({
        editor: editor as Parameters<typeof invokeInDocumentJarvis>[0]["editor"],
        cursorBlockId: null,
        scopeOverride: "page",
        prompt: "Process this daily page: extract tasks, events, and captures and create them.",
        pageId: initialPage.id,
      });
      const summary =
        result.actions.length > 0
          ? formatReceiptSummary(result.actions)
          : result.text.trim() || "Nothing to add — your day looks set.";
      toast.success(summary, { id: pending });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not process the page.", {
        id: pending,
      });
    } finally {
      setProcessing(false);
    }
  }, [initialPage.id, processing]);

  // `content` (the markdown mirror) moves on every edit, so it doubles as the
  // signal that tells the search hook to recompute ranges after the document
  // changes while the box is open.
  const search = useInPageSearch({
    containerRef: editorContainerRef,
    open: searchOpen,
    contentSignal: content,
  });

  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // Freshly-created pages open empty; drop the cursor straight into the title
  // so the user can start typing without a click. Runs once on mount only.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only autofocus
  useEffect(() => {
    if (initialPage.title.trim() === "") titleRef.current?.focus();
  }, []);

  const save = useCallback(
    async (
      overrides?: Partial<{
        title: string;
        content: string;
        contentJson: unknown;
        emoji: string | null;
        projectIds: string[];
      }>
    ) => {
      const savedJson =
        overrides && "contentJson" in overrides ? overrides.contentJson : contentJson;
      await updatePage({
        id: initialPage.id,
        title: overrides?.title ?? title,
        content: overrides?.content ?? content,
        contentJson: savedJson,
        emoji: overrides?.emoji !== undefined ? overrides.emoji : emoji,
        projectIds: overrides?.projectIds !== undefined ? overrides.projectIds : linkedProjectIds,
      });
      // Keep people_references in sync with the page's @-mentions on the same
      // (debounced) cadence as the content save. Idempotent: it diffs the
      // desired ids against the stored rows, so unchanged content is a no-op.
      await reconcilePersonReferences({
        fromType: "page",
        fromId: initialPage.id,
        personIds: extractPersonIdsFromBlockNote(savedJson),
      });
      setSavedAt(new Date());
      setShowSaved(true);
      if (savedFadeTimer.current) clearTimeout(savedFadeTimer.current);
      savedFadeTimer.current = setTimeout(() => setShowSaved(false), 2000);
    },
    [initialPage.id, title, content, contentJson, emoji, linkedProjectIds]
  );

  const scheduleAutosave = useCallback(
    (overrides?: Parameters<typeof save>[0]) => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      autosaveTimer.current = setTimeout(() => {
        void save(overrides);
      }, AUTOSAVE_DELAY);
    },
    [save]
  );

  // Cmd+S forces an immediate save (the editor is always live otherwise).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
        void save();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [save]);

  // Cmd+F / Ctrl+F opens OUR in-page find instead of the browser's native one,
  // but only when focus is inside this page island (the editor, title, or the
  // search bar itself) so it never hijacks Find elsewhere in the app. Once open,
  // a repeat Cmd+F re-focuses our input rather than reopening the browser find.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F"))) return;
      const root = editorContainerRef.current?.closest("[data-page-island]");
      const active = document.activeElement;
      const focusInside = active instanceof Node && root?.contains(active);
      if (!focusInside && !searchOpen) return;
      e.preventDefault();
      setSearchOpen(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);

  function handleEditorChange(json: unknown, markdown: string) {
    setContentJson(json);
    setContent(markdown);
    scheduleAutosave({ content: markdown, contentJson: json });
  }

  async function handleDelete() {
    await deletePage(initialPage.id);
    router.push("/wiki");
  }

  // Toggle the knowledge-graph gate (Phase 29). Optimistically flip local state,
  // persist via the server action, then invalidate the pages query so serverPage
  // re-syncs. On failure, roll the optimistic value back.
  async function handleToggleNoExport() {
    const next = !noExport;
    setNoExportState(next);
    const res = await setPageNoExport({ pageId: initialPage.id, noExport: next });
    if (!res.success) {
      setNoExportState(!next);
      return;
    }
    queryClient.invalidateQueries({ queryKey: tableKey("pages", userId) });
  }

  // Client-side single-page export (WIKI-EXPORT-01). Routes through the shared
  // markdown-export module so the file is receipt-stripped and titled exactly
  // like every other export surface. Uses the live editor `title`/`content`
  // (not the last-saved serverPage) so an in-progress edit exports as shown.
  function handleExport() {
    const markdown = pageToMarkdown({ id: initialPage.id, title, content });
    downloadTextFile(markdown, `${safeFileName(title)}.md`);
  }

  function handleTitleChange(v: string) {
    setTitle(v);
    scheduleAutosave({ title: v });
  }

  function handleEmojiCommit() {
    const val = emojiInput.trim() || null;
    setEmoji(val);
    setEmojiOpen(false);
    scheduleAutosave({ emoji: val });
  }

  function handleUnlinkProject(projectId: string) {
    const next = linkedProjectIds.filter((id) => id !== projectId);
    setLinkedProjectIds(next);
    scheduleAutosave({ projectIds: next });
  }

  function handleLinkProject(projectId: string) {
    if (linkedProjectIds.includes(projectId)) return;
    const next = [...linkedProjectIds, projectId];
    setLinkedProjectIds(next);
    scheduleAutosave({ projectIds: next });
  }

  // ProjectLinker toggle: route through link/unlink so direct links keep
  // persisting via updatePage's projectIds (never setFolderProjects).
  function handleToggleProject(projectId: string, next: boolean) {
    if (next) handleLinkProject(projectId);
    else handleUnlinkProject(projectId);
  }

  async function handlePickFolder(folderId: string | null) {
    await setPageFolder({ pageId: initialPage.id, folderId });
    queryClient.invalidateQueries({ queryKey: tableKey("pages", userId) });
    queryClient.invalidateQueries({ queryKey: tableKey("page_folders", userId) });
  }

  // Create a child folder under `parentId`, file the page into it, refetch.
  async function handleCreateFolder(name: string, parentId: string | null): Promise<string> {
    const id = crypto.randomUUID();
    const res = await createFolder({ id, name, parentId });
    if (!res.success) throw new Error(res.error);
    await setPageFolder({ pageId: initialPage.id, folderId: res.data.id });
    queryClient.invalidateQueries({ queryKey: tableKey("pages", userId) });
    queryClient.invalidateQueries({ queryKey: tableKey("page_folders", userId) });
    return res.data.id;
  }

  // Resolve a project id to a display name across every (active or archived)
  // project the linker knows about, plus the SSR-hydrated active set.
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of initialActiveProjects) map.set(p.id, p.name);
    for (const area of areas) for (const p of area.projects) map.set(p.id, p.name);
    return map;
  }, [areas, initialActiveProjects]);

  // The page's inherited project pills: walk its folder's effective set and keep
  // only the links it does NOT already hold directly. These render read-only.
  const inheritedPills = useMemo(() => {
    if (!serverPage.folderId) return [];
    const folderMap = new Map<string, FolderWithProjects>();
    for (const f of allFolders) folderMap.set(f.id, { ...f, ownProjectIds: [] });
    for (const link of folderLinks)
      folderMap.get(link.folderId)?.ownProjectIds.push(link.projectId);
    const folderEffectiveProjectIds = getEffectiveProjectIds(serverPage.folderId, folderMap);
    return buildPageProjectPills({
      directProjectIds: linkedProjectIds,
      folderName: serverPage.folderName,
      folderEffectiveProjectIds,
    }).filter((pill) => pill.isInherited);
  }, [serverPage.folderId, serverPage.folderName, allFolders, folderLinks, linkedProjectIds]);

  const inheritedLinks = useMemo(
    () =>
      inheritedPills.map((pill) => ({
        projectId: pill.projectId,
        sourceFolderName: pill.sourceFolderName ?? serverPage.folderName ?? "a parent folder",
      })),
    [inheritedPills, serverPage.folderName]
  );

  const linkedProjects = initialActiveProjects.filter((p) => linkedProjectIds.includes(p.id));

  const colorMode = resolvedTheme === "dark" ? "dark" : "light";

  // Breadcrumb from the page's primary (first) project link plus its (global,
  // project-independent) folder. The page can be linked to several projects; the
  // chips row below shows the full set, so the breadcrumb just anchors the
  // primary project. The folder is page-level now (Phase 21), so it renders
  // independent of any project link.
  const primaryLink = serverPage.projects[0] ?? null;
  const primaryProject = primaryLink
    ? initialActiveProjects.find((p) => p.id === primaryLink.id)
    : undefined;

  // Full folder ancestry (root first) for the breadcrumb: walk parentId from the
  // page's folder up to the root via `allFolders`, then reverse so the path
  // reads top-down. Cycle-safe with a visited guard against a corrupt chain.
  const folderPath = useMemo(() => {
    if (!serverPage.folderId) return [] as { id: string; name: string }[];
    const byId = new Map(allFolders.map((f) => [f.id, f]));
    const chain: { id: string; name: string }[] = [];
    const visited = new Set<string>();
    let current: string | null = serverPage.folderId;
    while (current && !visited.has(current)) {
      visited.add(current);
      const node = byId.get(current);
      if (!node) break;
      chain.push({ id: node.id, name: node.name });
      current = node.parentId;
    }
    return chain.reverse();
  }, [serverPage.folderId, allFolders]);

  return (
    <div
      data-page-island
      className="relative flex flex-col gap-4 p-6 max-w-3xl mx-auto w-full min-h-full"
    >
      {searchOpen && (
        <PageSearchBar
          query={search.query}
          onQueryChange={search.setQuery}
          total={search.total}
          current={search.current}
          onNext={search.next}
          onPrev={search.prev}
          onClose={closeSearch}
        />
      )}

      {/* Breadcrumb: Wiki / Area / [Project pill] / Folder > Subfolder > … / Page */}
      <nav className="flex items-center gap-1 text-[11px] font-mono text-[var(--ink-muted)] flex-wrap">
        <button
          type="button"
          onClick={() => router.push("/wiki")}
          className="hover:text-[var(--ink)] transition-colors cursor-pointer"
        >
          Wiki
        </button>
        {primaryProject?.areaName && (
          <>
            <span className="opacity-50">/</span>
            <span>{primaryProject.areaName}</span>
          </>
        )}
        {primaryLink && (
          <>
            <span className="opacity-50">/</span>
            <button
              type="button"
              onClick={() => router.push(`/projects/${primaryLink.id}`)}
              className="bg-[var(--surface)] border border-[var(--edge)] text-[var(--ink)] px-1.5 py-0.5 rounded-sm hover:border-[var(--ink-muted)] transition-colors cursor-pointer truncate max-w-[200px]"
            >
              {primaryLink.name}
            </button>
          </>
        )}
        {/* Full folder ancestry path, root first. */}
        {folderPath.map((folder) => (
          <span key={folder.id} className="flex items-center gap-1">
            <span className="opacity-50">/</span>
            <span className="truncate max-w-[180px]">{folder.name}</span>
          </span>
        ))}
        {/* Current page is the final, non-link segment. */}
        <span className="opacity-50">/</span>
        <span className="text-[var(--ink)] truncate max-w-[200px]">{title || "Untitled page"}</span>
      </nav>

      {/* Sticky per-doc nav bar: saved indicator + export, hide-receipts, delete.
          Pinned top-right, opaque canvas background so body content scrolling
          under it stays hidden. */}
      <div className="sticky top-0 z-10 self-end ml-auto flex items-center gap-1.5 rounded-sm border border-[var(--edge)] bg-[var(--canvas)] px-2 py-1">
        {showSaved && (
          <span className="flex items-center gap-1 text-[11px] font-mono text-[var(--ink-muted)] animate-fade-in mr-0.5">
            <Check size={11} strokeWidth={2} />
            Saved
          </span>
        )}

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-pressed={searchOpen}
          className={`p-1.5 rounded-sm transition-colors duration-150 cursor-pointer hover:bg-[var(--surface)] ${
            searchOpen ? "text-[var(--ink)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
          }`}
          title="Find in page"
        >
          <Search size={13} strokeWidth={1.5} />
        </button>

        <button
          type="button"
          onClick={handleExport}
          className="p-1.5 rounded-sm text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors duration-150 cursor-pointer"
          title="Export as Markdown"
        >
          <Download size={13} strokeWidth={1.5} />
        </button>

        <button
          type="button"
          onClick={() => setHideReceipts((v) => !v)}
          aria-pressed={hideReceipts}
          className={`p-1.5 rounded-sm transition-colors duration-150 cursor-pointer hover:bg-[var(--surface)] ${
            hideReceipts ? "text-[var(--ink)]" : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
          }`}
          title={hideReceipts ? "Show JARVIS receipts" : "Hide JARVIS receipts"}
        >
          {hideReceipts ? (
            <EyeOff size={13} strokeWidth={1.5} />
          ) : (
            <Eye size={13} strokeWidth={1.5} />
          )}
        </button>

        <button
          type="button"
          onClick={handleToggleNoExport}
          aria-pressed={noExport}
          aria-label={
            noExport ? "Include in JARVIS knowledge graph" : "Exclude from JARVIS knowledge graph"
          }
          className={`p-1.5 rounded-sm transition-colors duration-150 cursor-pointer hover:bg-[var(--surface)] ${
            noExport ? "text-[var(--ink-muted)] hover:text-[var(--ink)]" : "text-[var(--ink)]"
          }`}
          title={
            noExport
              ? "Excluded from JARVIS knowledge graph (click to include)"
              : "Included in JARVIS knowledge graph (click to exclude)"
          }
        >
          {noExport ? (
            <GlobeLock size={13} strokeWidth={1.5} />
          ) : (
            <Globe size={13} strokeWidth={1.5} />
          )}
        </button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="p-1.5 rounded-sm text-[var(--ink-muted)] hover:text-red-500 hover:bg-[var(--surface)] transition-colors duration-150 cursor-pointer"
              title="Delete page"
            >
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-serif">Delete this page?</AlertDialogTitle>
              <AlertDialogDescription className="font-serif text-[13px]">
                This will permanently delete &ldquo;{title || "Untitled page"}&rdquo;. Project links
                will be removed but the projects themselves are untouched. This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="font-serif text-[13px]">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="font-serif text-[13px] bg-red-600 hover:bg-red-700 text-white"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Emoji + Title row */}
      <div className="flex items-start gap-3">
        {/* Emoji picker */}
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-sm hover:bg-[var(--surface)] transition-colors duration-150 cursor-pointer text-[20px] leading-none"
              title="Set emoji"
            >
              {emoji ? (
                <span>{emoji}</span>
              ) : (
                <FileText size={18} strokeWidth={1.25} className="text-[var(--ink-muted)]" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3 flex flex-col gap-2" align="start">
            <label
              htmlFor="page-emoji-input"
              className="text-[11px] font-mono text-[var(--ink-muted)] uppercase tracking-wide"
            >
              Emoji
            </label>
            <input
              id="page-emoji-input"
              type="text"
              maxLength={4}
              value={emojiInput}
              onChange={(e) => setEmojiInput(e.target.value)}
              placeholder="Type an emoji..."
              className="w-full px-2 py-1.5 text-[14px] bg-transparent border border-[var(--edge)] rounded-sm text-[var(--ink)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--ink-muted)] transition-colors duration-150"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleEmojiCommit();
              }}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleEmojiCommit}
                className="flex-1 py-1 text-[12px] font-mono text-[var(--ink)] border border-[var(--edge)] rounded-sm hover:bg-[var(--surface)] transition-colors duration-150 cursor-pointer"
              >
                Set
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmojiInput("");
                  setEmoji(null);
                  setEmojiOpen(false);
                  scheduleAutosave({ emoji: null });
                }}
                className="px-2 py-1 text-[12px] font-mono text-[var(--ink-muted)] border border-[var(--edge)] rounded-sm hover:bg-[var(--surface)] transition-colors duration-150 cursor-pointer"
              >
                Clear
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Inline title */}
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              editorFocusRef.current?.();
            }
          }}
          placeholder="Untitled page"
          className="flex-1 text-[22px] font-serif font-medium text-[var(--ink)] bg-transparent border-none outline-none placeholder:text-[var(--ink-muted)] placeholder:font-serif placeholder:font-medium"
        />
      </div>

      {/* Daily Page badge + process button (Phase 30, WIKI-DAILY-03/04). Only
          Daily Pages (daily_date IS NOT NULL) surface these. */}
      {isDailyPage && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono uppercase tracking-[0.06em] text-[var(--hud-cyan)] glass-tile">
            <CalendarDays size={11} strokeWidth={1.75} />
            Daily Page
          </span>
          <button
            type="button"
            onClick={handleProcessDailyPage}
            disabled={processing}
            title="Run the whole page through JARVIS to extract tasks, events, and captures"
            className="glass-button inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-serif text-[var(--ink)] hover:text-[var(--hud-cyan)] transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? (
              <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
            ) : (
              <Sparkles size={12} strokeWidth={1.75} />
            )}
            <span>{processing ? "Processing…" : "Process this page"}</span>
          </button>
        </div>
      )}

      {/* Project links + folder row */}
      <div className="flex flex-wrap items-center gap-2">
        {linkedProjects.map((proj) => (
          <span
            key={proj.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[12px] font-mono text-[var(--ink-muted)] bg-[var(--surface)] border border-[var(--edge)]"
          >
            {proj.name}
            <button
              type="button"
              onClick={() => handleUnlinkProject(proj.id)}
              className="ml-0.5 hover:text-[var(--ink)] transition-colors duration-100 cursor-pointer"
              title="Unlink project"
            >
              <X size={10} strokeWidth={2} />
            </button>
          </span>
        ))}
        {/* Inherited links: read-only, no remove control (Phase 24). */}
        {inheritedLinks.map((link) => (
          <span
            key={`inherited-${link.projectId}`}
            title={`Inherited from ${link.sourceFolderName}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[12px] font-mono italic text-[var(--ink-muted)] border border-dashed border-[var(--edge)] opacity-70"
          >
            <Lock size={10} strokeWidth={1.5} />
            {projectNameById.get(link.projectId) ?? "Project"}
            <span className="text-[10px]">from {link.sourceFolderName}</span>
          </span>
        ))}
        <ProjectLinker
          areas={areas}
          selectedProjectIds={linkedProjectIds}
          inheritedLinks={inheritedLinks}
          onToggle={handleToggleProject}
        />
        <FolderPicker
          folders={allFolders}
          currentFolderId={serverPage.folderId}
          onPick={handlePickFolder}
          onCreate={handleCreateFolder}
        />
      </div>

      {/* Last edited */}
      <p className="text-[11px] font-mono text-[var(--ink-muted)]">
        Last edited {formatDistanceToNow(new Date(serverPage.updatedAt), { addSuffix: true })}
      </p>

      {/* Editor — always-live Notion-style block editor */}
      <div className="flex-1 min-h-[400px]">
        <PageBlockEditor
          initialContentJson={serverPage.contentJson}
          initialMarkdown={serverPage.content}
          theme={colorMode}
          onChange={handleEditorChange}
          pageId={initialPage.id}
          userId={userId}
          hideReceipts={hideReceipts}
          focusRef={editorFocusRef}
          containerRef={editorContainerRef}
          onEditorReady={handleEditorReady}
          people={people}
          onPersonCreated={refreshPeople}
        />
      </div>
    </div>
  );
}
