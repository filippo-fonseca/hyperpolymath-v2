"use client";

import { setPageFolder, setParentFolder } from "@/app/actions/folders";
import { movePagesBulk, reorderItem } from "@/app/actions/ordering";
import { updatePage } from "@/app/actions/pages";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { FolderRow } from "@/lib/pages/folder-projects";
import { tableKey } from "@/lib/realtime/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

/**
 * All mutations the Explorer fires: move + reorder + rename, each with the
 * exact optimistic cache patch shape wave-1 established (patch, fire action,
 * invalidate on failure).
 */
export function useExplorerMutations(userId: string) {
  const qc = useQueryClient();
  const pagesKey = tableKey("pages", userId);
  const foldersKey = tableKey("page_folders", userId);

  const patchPages = useCallback(
    (updater: (old: PageWithProjects[]) => PageWithProjects[]) => {
      qc.setQueryData<PageWithProjects[]>(pagesKey, (old) => updater(old ?? []));
    },
    [pagesKey, qc],
  );

  const patchFolders = useCallback(
    (updater: (old: FolderRow[]) => FolderRow[]) => {
      qc.setQueryData<FolderRow[]>(foldersKey, (old) => updater(old ?? []));
    },
    [foldersKey, qc],
  );

  const invalidatePages = useCallback(() => {
    qc.invalidateQueries({ queryKey: pagesKey });
  }, [pagesKey, qc]);

  const invalidateFolders = useCallback(() => {
    qc.invalidateQueries({ queryKey: foldersKey });
  }, [foldersKey, qc]);

  const movePageTo = useCallback(
    async (pageId: string, folderId: string | null) => {
      patchPages((old) =>
        old.map((p) => (p.id === pageId ? { ...p, folderId } : p)),
      );
      const r = await setPageFolder({ pageId, folderId });
      if (!r.success) {
        toast.error(r.error);
        invalidatePages();
      }
    },
    [invalidatePages, patchPages],
  );

  const moveFolderTo = useCallback(
    async (folderId: string, parentId: string | null) => {
      patchFolders((old) =>
        old.map((f) => (f.id === folderId ? { ...f, parentId } : f)),
      );
      const r = await setParentFolder({ folderId, parentId });
      if (!r.success) {
        toast.error(r.error);
        invalidateFolders();
      }
    },
    [invalidateFolders, patchFolders],
  );

  const bulkMovePages = useCallback(
    async (pageIds: string[], folderId: string | null) => {
      patchPages((old) => {
        const set = new Set(pageIds);
        return old.map((p) => (set.has(p.id) ? { ...p, folderId } : p));
      });
      const r = await movePagesBulk({ pageIds, folderId });
      if (!r.success) {
        toast.error(r.error);
        invalidatePages();
      }
    },
    [invalidatePages, patchPages],
  );

  const reorder = useCallback(
    async (input: {
      kind: "page" | "folder";
      id: string;
      afterId?: string | null;
      beforeId?: string | null;
      parentId: string | null;
    }) => {
      const r = await reorderItem(input);
      if (!r.success) {
        toast.error(r.error);
        input.kind === "page" ? invalidatePages() : invalidateFolders();
      }
    },
    [invalidateFolders, invalidatePages],
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      patchPages((old) => old.map((p) => (p.id === id ? { ...p, title } : p)));
      const r = await updatePage({ id, title });
      if (!r.success) {
        toast.error(r.error);
        invalidatePages();
      }
    },
    [invalidatePages, patchPages],
  );

  return {
    movePageTo,
    moveFolderTo,
    bulkMovePages,
    reorder,
    rename,
    patchPages,
    patchFolders,
    invalidatePages,
    invalidateFolders,
  };
}
