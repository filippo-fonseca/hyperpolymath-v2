"use client";

import { setPageFolder, setParentFolder } from "@/app/actions/folders";
import { movePagesBulk, reorderItem } from "@/app/actions/ordering";
import { updatePage } from "@/app/actions/pages";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { FolderRow } from "@/lib/pages/folder-projects";
import { compareExplorerItems, initialKeysFor } from "@/lib/pages/position";
import { tableKey } from "@/lib/realtime/query-keys";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

/**
 * All mutations the Explorer fires: move + reorder + rename, each with the
 * exact optimistic cache patch shape wave-1 established (patch, fire action,
 * then invalidate).
 *
 * The invalidation runs on success as well as on failure. The optimistic patch
 * is a hand-built row, not server truth: it carries no server-assigned
 * `positionKey`, no `updatedAt` bump, and none of the derived joins. Leaving it
 * in the cache after a successful write means a later navigate-back renders the
 * stub instead of the row the database actually holds. Invalidate-only, no
 * payload merge (CLAUDE.md Critical Pattern 3): the patch keeps the UI instant,
 * the refetch makes it true.
 */
export function useExplorerMutations(userId: string) {
  const qc = useQueryClient();
  const pagesKey = tableKey("pages", userId);
  const foldersKey = tableKey("page_folders", userId);

  const patchPages = useCallback(
    (updater: (old: PageWithProjects[]) => PageWithProjects[]) => {
      qc.setQueryData<PageWithProjects[]>(pagesKey, (old) => updater(old ?? []));
    },
    [pagesKey, qc]
  );

  const patchFolders = useCallback(
    (updater: (old: FolderRow[]) => FolderRow[]) => {
      qc.setQueryData<FolderRow[]>(foldersKey, (old) => updater(old ?? []));
    },
    [foldersKey, qc]
  );

  const invalidatePages = useCallback(() => {
    qc.invalidateQueries({ queryKey: pagesKey });
  }, [pagesKey, qc]);

  const invalidateFolders = useCallback(() => {
    qc.invalidateQueries({ queryKey: foldersKey });
  }, [foldersKey, qc]);

  const movePageTo = useCallback(
    async (pageId: string, folderId: string | null) => {
      patchPages((old) => old.map((p) => (p.id === pageId ? { ...p, folderId } : p)));
      const r = await setPageFolder({ pageId, folderId });
      if (!r.success) toast.error(r.error);
      invalidatePages();
    },
    [invalidatePages, patchPages]
  );

  const moveFolderTo = useCallback(
    async (folderId: string, parentId: string | null) => {
      patchFolders((old) => old.map((f) => (f.id === folderId ? { ...f, parentId } : f)));
      const r = await setParentFolder({ folderId, parentId });
      if (!r.success) toast.error(r.error);
      invalidateFolders();
    },
    [invalidateFolders, patchFolders]
  );

  const bulkMovePages = useCallback(
    async (pageIds: string[], folderId: string | null) => {
      patchPages((old) => {
        const set = new Set(pageIds);
        return old.map((p) => (set.has(p.id) ? { ...p, folderId } : p));
      });
      const r = await movePagesBulk({ pageIds, folderId });
      if (!r.success) toast.error(r.error);
      invalidatePages();
    },
    [invalidatePages, patchPages]
  );

  const reorder = useCallback(
    async (input: {
      kind: "page" | "folder";
      id: string;
      afterId?: string | null;
      beforeId?: string | null;
      parentId: string | null;
    }) => {
      const place = <T extends { id: string; positionKey?: string | null }>(rows: T[]) => {
        const without = rows.filter((row) => row.id !== input.id);
        let insertAt = without.length;
        if (input.beforeId) {
          const index = without.findIndex((row) => row.id === input.beforeId);
          if (index >= 0) insertAt = index;
        } else if (input.afterId) {
          const index = without.findIndex((row) => row.id === input.afterId);
          if (index >= 0) insertAt = index + 1;
        }
        const moving = rows.find((row) => row.id === input.id);
        if (!moving) return rows;
        without.splice(insertAt, 0, moving);
        const keys = initialKeysFor(without.length);
        return without.map((row, index) => ({ ...row, positionKey: keys[index] }));
      };

      if (input.kind === "page") {
        patchPages((old) => {
          const siblings = old
            .filter((page) => !page.dailyDate && (page.folderId ?? null) === input.parentId)
            .sort((a, b) =>
              compareExplorerItems(
                { positionKey: a.positionKey, name: a.title },
                { positionKey: b.positionKey, name: b.title }
              )
            );
          const placed = new Map(place(siblings).map((page) => [page.id, page.positionKey]));
          return old.map((page) =>
            placed.has(page.id) ? { ...page, positionKey: placed.get(page.id) ?? null } : page
          );
        });
      } else {
        patchFolders((old) => {
          const siblings = old
            .filter((folder) => (folder.parentId ?? null) === input.parentId)
            .sort(compareExplorerItems);
          const placed = new Map(place(siblings).map((folder) => [folder.id, folder.positionKey]));
          return old.map((folder) =>
            placed.has(folder.id)
              ? { ...folder, positionKey: placed.get(folder.id) ?? null }
              : folder
          );
        });
      }
      const r = await reorderItem(input);
      if (!r.success) toast.error(r.error);
      // The server re-keys the whole sibling run, so the locally generated keys
      // are a stand-in until the refetch lands, win or lose.
      if (input.kind === "page") invalidatePages();
      else invalidateFolders();
    },
    [invalidateFolders, invalidatePages, patchFolders, patchPages]
  );

  const rename = useCallback(
    async (id: string, title: string) => {
      patchPages((old) => old.map((p) => (p.id === id ? { ...p, title } : p)));
      const r = await updatePage({ id, title });
      if (!r.success) toast.error(r.error);
      invalidatePages();
    },
    [invalidatePages, patchPages]
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
