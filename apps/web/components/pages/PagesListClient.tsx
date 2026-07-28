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
import { Button } from "@/components/ui/button";
import { PageScaffold } from "@/components/ui/PageScaffold";
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

  // Realtime-driven wiki-home reads. The useTableSubscription channels above
  // (pages / page_folders / folder_projects) — plus the app-shell SearchProvider
  // and PageDetailClient channels — invalidate these keys on every INSERT/UPDATE/
  // DELETE, and the page-view save() mirrors that invalidation locally. While
  // /wiki is mounted, an invalidation refetches the active observer live (the
  // concurrent-tab / rename-in-place case).
  //
  // These use refetchOnMount:"always", not `true`. `true` only refetches when
  // the query is stale or was invalidated, and the global QueryClient runs
  // staleTime 30s, so a navigate-back within that window is a no-op: the wiki
  // home renders whatever the cache holds. Worse, browser Back restores the RSC
  // payload from the client Router Cache, so `initialData` is a snapshot of
  // whenever the route was last rendered rather than of now. Both paths show
  // stale contents, and they compound. "always" refetches on every mount of
  // /wiki, which is one query per navigation onto a surface whose entire job is
  // listing rows that other surfaces mutate.
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
    // The one page container (SDC-1 §2.9), so the H1 left edge lines up with
    // every other scaffolded route. The wiki home is the one route that owns
    // its own scroll (the explorer canvas scrolls internally; the Stage
    // renders it h-full), so the scaffold becomes a flex column filling the
    // stage, and the deep document bottom padding gives way to the section
    // step so the explorer window can breathe without drowning.
    <PageScaffold
      title="Wiki"
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleExportAll}
            disabled={isEmpty}
            title="Export the entire wiki as a .zip of markdown files"
          >
            <Download size={13} strokeWidth={1.5} />
            Export all
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWikiManagerOpen(true)}
            title="Manage wiki properties"
          >
            <SlidersHorizontal size={13} strokeWidth={1.5} />
            Properties
          </Button>
        </>
      }
      className="flex h-full min-h-0 flex-col gap-6 overflow-hidden pb-6"
    >
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
    </PageScaffold>
  );
}
