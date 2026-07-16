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
import { PropertiesManagerModal } from "./PropertiesManagerModal";
import { JournalRail } from "@/components/wiki/journal/JournalRail";
import { WikiExplorer } from "@/components/wiki/WikiExplorer";
import { buildTreeZip, downloadZipFiles } from "@/lib/pages/markdown-export";
import { buildPagesTree } from "@/lib/pages/tree";
import type { FolderProjectLink, FolderRow } from "@/lib/pages/folder-projects";
import type { DailyPageRef, PageWithProjects } from "@/lib/db/queries/pages";
import { useEnsureTodayDailyPage } from "@/lib/pages/useEnsureTodayDailyPage";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

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

  // Wiki-home entity queries refetch on every mount. The global QueryClient
  // runs refetchOnMount:false (initialData sticks across remounts), and Realtime
  // only refetches *active* observers — so a rename/create/delete made inside a
  // page view (while /wiki is unmounted) leaves the cached list stale, and a
  // same-tab return to /wiki shows the old title until a hard refresh. Forcing a
  // mount-time refetch here makes create/rename/delete propagate live across
  // every wiki surface (cards, list, rail) on navigate-back, complementing the
  // Realtime subscriptions above which cover the concurrent-tab case.
  const { data: allPages = [] } = useQuery({
    queryKey: pagesKey,
    queryFn: () => getPagesForCurrentUser(),
    initialData: initialPages,
    refetchOnMount: "always",
  });
  const { data: folders = [] } = useQuery({
    queryKey: foldersKey,
    queryFn: () => getFoldersForCurrentUser(),
    initialData: initialFolders,
    refetchOnMount: "always",
  });
  const { data: folderProjects = [] } = useQuery({
    queryKey: tableKey("folder_projects", userId),
    queryFn: () => getFolderProjectsForCurrentUser(),
    initialData: initialFolderProjects,
    refetchOnMount: "always",
  });
  // See wave-1 for why projects / fieldDefinitions aren't seeded with []:
  // the global QueryClient runs refetchOnMount:false, so a seed sticks.
  const { data: projects = [] } = useQuery({
    queryKey: tableKey("projects", userId),
    queryFn: () => getProjectsForCurrentUser(),
  });
  const { data: fieldDefinitions = [] } = useQuery({
    queryKey: fieldDefsKey,
    queryFn: () => getFieldDefinitionsForCurrentUser(),
  });
  const { data: dailyPages = [], isSuccess: dailyFetched } = useQuery<
    DailyPageRef[]
  >({
    queryKey: ["daily-pages", userId],
    queryFn: () => getDailyPagesForCurrentUser(),
    initialData: initialDailyPages,
    refetchOnMount: "always",
  });

  // Wave-3: ensure today's Daily Page exists without navigating. Coordinates
  // with the app-shell `DailyAutoOpen` via the shared partial unique index.
  useEnsureTodayDailyPage(userId, dailyPages, dailyFetched);

  const [openingDate, setOpeningDate] = useState<string | null>(null);
  const [wikiManagerOpen, setWikiManagerOpen] = useState(false);

  const handleFieldsChanged = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: pagesKey });
    queryClient.invalidateQueries({ queryKey: fieldDefsKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, userId]);

  const handleOpenPage = useCallback(
    (pageId: string) => {
      router.push(`/wiki/${pageId}`);
    },
    [router],
  );

  const handleCreateForDate = useCallback(
    async (iso: string) => {
      if (openingDate) return;
      setOpeningDate(iso);
      try {
        const result = await openDailyPage({ date: iso });
        if (result.success) router.push(`/wiki/${result.data.id}`);
      } finally {
        setOpeningDate(null);
      }
    },
    [openingDate, router],
  );

  function handleExportAll() {
    const tree = buildPagesTree(folders, folderProjects, allPages);
    const files = buildTreeZip(tree, allPages);
    downloadZipFiles(files, "wiki.zip");
  }

  const isEmpty = allPages.length === 0 && folders.length === 0;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col gap-6 overflow-hidden p-6">
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

      {/* Wave-3: the editorial Journal rail (today card + 7-day trail + calendar). */}
      <JournalRail
        allPages={allPages}
        dailyPages={dailyPages}
        onOpenPage={handleOpenPage}
        onCreateForDate={handleCreateForDate}
        openingDate={openingDate}
      />

      <WikiExplorer
        userId={userId}
        pages={allPages}
        folders={folders}
        folderProjects={folderProjects}
        projects={projects}
      />

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
