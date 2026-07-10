"use client";

import {
  getFolderProjectsForCurrentUser,
  getFoldersForCurrentUser,
} from "@/app/actions/folders";
import {
  getDailyPagesForCurrentUser,
  getPagesForCurrentUser,
  openDailyPage,
} from "@/app/actions/pages";
import { getFieldDefinitionsForCurrentUser } from "@/app/actions/page-fields";
import { getProjectsForCurrentUser } from "@/app/actions/projects";
import { JournalCalendar } from "@/components/journaling/JournalCalendar";
import { PropertiesManagerModal } from "./PropertiesManagerModal";
import { WikiExplorer } from "@/components/wiki/WikiExplorer";
import { buildTreeZip, downloadZipFiles } from "@/lib/pages/markdown-export";
import { buildPagesTree } from "@/lib/pages/tree";
import type { FolderProjectLink, FolderRow } from "@/lib/pages/folder-projects";
import type { DailyPageRef, PageWithProjects } from "@/lib/db/queries/pages";
import { dailyDayClickAction, dailyPageTitle } from "@/lib/pages/daily-page";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

interface Props {
  userId: string;
  initialPages: PageWithProjects[];
  initialFolders: FolderRow[];
  initialFolderProjects: FolderProjectLink[];
  initialDailyPages: DailyPageRef[];
}

/**
 * /wiki home. Header + Daily-Pages placeholder (wave-3-owned) + the new
 * WikiExplorer surface. The Explorer owns folder drill-down, dnd, selection,
 * keyboard, the inspector, search, and view rendering — this shell only pumps
 * data into it and mirrors the app-wide realtime subscriptions so an echo from
 * another tab reconciles as-is.
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
  const fieldDefsKey = ["page-field-definitions", userId] as const;

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
  // See wave-1 for why projects / fieldDefinitions aren't seeded with []:
  // the global QueryClient runs refetchOnMount:false, so a seed sticks.
  useQuery({
    queryKey: tableKey("projects", userId),
    queryFn: () => getProjectsForCurrentUser(),
  });
  const { data: fieldDefinitions = [] } = useQuery({
    queryKey: fieldDefsKey,
    queryFn: () => getFieldDefinitionsForCurrentUser(),
  });
  const { data: dailyPages = [] } = useQuery<DailyPageRef[]>({
    queryKey: ["daily-pages", userId],
    queryFn: () => getDailyPagesForCurrentUser(),
    initialData: initialDailyPages,
  });

  const [dailyOpen, setDailyOpen] = useState(true);
  const [openingDay, setOpeningDay] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    format(new Date(), "yyyy-MM-dd"),
  );
  const [wikiManagerOpen, setWikiManagerOpen] = useState(false);

  const handleFieldsChanged = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: pagesKey });
    queryClient.invalidateQueries({ queryKey: fieldDefsKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, userId]);

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

  const selectedDailyPage = dailyByDate.get(selectedDate) ?? null;

  function handleExportAll() {
    const tree = buildPagesTree(folders, folderProjects, allPages);
    const files = buildTreeZip(tree, allPages);
    downloadZipFiles(files, "wiki.zip");
  }

  const isEmpty = allPages.length === 0 && folders.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl leading-none text-[var(--ink)]">Wiki</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportAll}
            disabled={isEmpty}
            title="Export the entire wiki as a .zip of markdown files"
            className="flex items-center gap-1.5 rounded-sm border border-[var(--edge)] px-3 py-1.5 font-serif text-[13px] text-[var(--ink)] transition-colors duration-150 ease-out hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={13} strokeWidth={1.5} />
            <span>Export all</span>
          </button>
          <button
            type="button"
            onClick={() => setWikiManagerOpen(true)}
            title="Manage wiki properties"
            className="flex items-center gap-1.5 rounded-sm border border-[var(--edge)] px-3 py-1.5 font-serif text-[13px] text-[var(--ink)] transition-colors duration-150 ease-out hover:bg-[var(--surface)]"
          >
            <SlidersHorizontal size={13} strokeWidth={1.5} />
            <span>Properties</span>
          </button>
        </div>
      </div>

      {/* Daily Pages — collapsible calendar section (wave 3 owns the rebuild). */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setDailyOpen((o) => !o)}
            className="flex cursor-pointer items-center gap-1.5 text-left"
            aria-expanded={dailyOpen}
          >
            <span className="flex-shrink-0 text-[var(--ink-muted)]">
              {dailyOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <CalendarDays
              size={13}
              strokeWidth={1.5}
              className="flex-shrink-0 text-[var(--ink-muted)]"
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
              className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-[var(--edge)] px-2.5 py-1 font-serif text-[12px] text-[var(--hud-cyan)] transition-colors duration-150 ease-out hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-50"
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
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-muted)]">
                    No daily page
                  </span>
                  <span className="truncate font-serif text-[13px] text-[var(--ink)]">
                    {dailyPageTitle(selectedDate)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void createAndOpen(selectedDate)}
                  disabled={openingDay}
                  className="glass-button flex flex-shrink-0 cursor-pointer items-center gap-1.5 rounded-sm px-2.5 py-1 font-serif text-[12px] text-[var(--hud-cyan)] disabled:cursor-not-allowed disabled:opacity-50"
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

      <WikiExplorer userId={userId} pages={allPages} folders={folders} />

      <PropertiesManagerModal
        open={wikiManagerOpen}
        onOpenChange={setWikiManagerOpen}
        scope="wiki"
        definitions={fieldDefinitions}
        onChanged={handleFieldsChanged}
      />
    </div>
  );
}
