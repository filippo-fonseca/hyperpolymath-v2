"use client";

import {
  createFolder,
  deleteFolder,
  renameFolder,
  setFolderColor,
} from "@/app/actions/folders";
import { createPage, deletePage } from "@/app/actions/pages";
import type { useExplorerMutations } from "@/components/wiki/explorer-hooks/useExplorerMutations";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import type { FolderRow } from "@/lib/pages/folder-projects";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { PaletteToken } from "@/lib/ui/palette";
import { toast } from "sonner";

type Mutations = ReturnType<typeof useExplorerMutations>;

interface UseExplorerActionsArgs {
  mutations: Mutations;
  folders: FolderRow[];
  folderId: string | null;
  setFolderId: (id: string | null) => void;
  clearSelection: () => void;
  childrenOf: Map<string, string[]>;
}

/** Bundles open/create/delete/rename handlers + rename+new-folder dialog state. */
export function useExplorerActions({
  mutations,
  folders,
  folderId,
  setFolderId,
  clearSelection,
  childrenOf,
}: UseExplorerActionsArgs) {
  const router = useRouter();
  const [renameTarget, setRenameTarget] = useState<ExplorerItem | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  const openItem = useCallback(
    (item: ExplorerItem) => {
      if (item.kind === "folder") {
        setFolderId(item.id);
        clearSelection();
        return;
      }
      router.push(`/wiki/${item.id}`);
    },
    [clearSelection, router, setFolderId],
  );

  const handleCreatePage = useCallback(async () => {
    const id = crypto.randomUUID();
    const now = new Date();
    mutations.patchPages((old) => [
      {
        id,
        title: "",
        content: "",
        contentJson: null,
        emoji: null,
        pinned: false,
        url: null,
        coverImageUrl: null,
        coverImageAttribution: null,
        noExport: false,
        folderId,
        folderName: folderId ? folders.find((f) => f.id === folderId)?.name ?? null : null,
        dailyDate: null,
        positionKey: null,
        createdAt: now,
        updatedAt: now,
        projects: [],
        fields: [],
      },
      ...old,
    ]);
    const r = await createPage({ id, title: "", content: "", folderId });
    if (!r.success) {
      toast.error(r.error);
      mutations.invalidatePages();
      return;
    }
    // The optimistic row above is a stub: empty title, null positionKey, a
    // client clock for createdAt. Invalidate on success too, or navigating back
    // to /wiki inside the 30s staleTime window renders that stub instead of the
    // page the server actually created.
    mutations.invalidatePages();
    router.push(`/wiki/${r.data.id}`);
  }, [folderId, folders, mutations, router]);

  const handleCreateFolder = useCallback(
    async (name: string) => {
      const id = crypto.randomUUID();
      mutations.patchFolders((old) => [
        ...old,
        { id, parentId: folderId, name, orderIndex: old.length },
      ]);
      const r = await createFolder({ id, parentId: folderId, name });
      if (!r.success) toast.error(r.error);
      mutations.invalidateFolders();
    },
    [folderId, mutations],
  );

  const handleDelete = useCallback(
    async (item: ExplorerItem) => {
      if (item.kind === "page") {
        mutations.patchPages((old) => old.filter((p) => p.id !== item.id));
        const r = await deletePage(item.id);
        if (!r.success) toast.error(r.error);
        mutations.invalidatePages();
        return;
      }
      const subtree = new Set<string>();
      const stack = [item.id];
      const seen = new Set<string>();
      while (stack.length > 0) {
        const cur = stack.pop() as string;
        if (seen.has(cur)) continue;
        seen.add(cur);
        subtree.add(cur);
        for (const c of childrenOf.get(cur) ?? []) stack.push(c);
      }
      mutations.patchFolders((old) => old.filter((f) => !subtree.has(f.id)));
      const r = await deleteFolder(item.id);
      if (!r.success) toast.error(r.error);
      // Deleting a folder cascades to the pages inside it, so both keys are
      // stale, not just the folder one.
      mutations.invalidateFolders();
      mutations.invalidatePages();
    },
    [childrenOf, mutations],
  );

  const submitRename = useCallback(
    async (name: string) => {
      if (!renameTarget) return;
      if (renameTarget.kind === "page") {
        await mutations.rename(renameTarget.id, name);
      } else {
        mutations.patchFolders((old) =>
          old.map((f) => (f.id === renameTarget.id ? { ...f, name } : f)),
        );
        const r = await renameFolder({ id: renameTarget.id, name });
        if (!r.success) toast.error(r.error);
        mutations.invalidateFolders();
      }
      setRenameTarget(null);
    },
    [mutations, renameTarget],
  );

  /**
   * Paint (or un-paint) a folder. Optimistic patch first so the tile recolours
   * under the cursor, then the write; a rejection falls back to whatever the
   * refetch says rather than to a guess about the previous colour.
   */
  const handleSetFolderColor = useCallback(
    async (folderId: string, color: PaletteToken | null) => {
      mutations.patchFolders((old) =>
        old.map((f) => (f.id === folderId ? { ...f, color } : f)),
      );
      const r = await setFolderColor({ id: folderId, color });
      if (!r.success) toast.error(r.error);
      mutations.invalidateFolders();
    },
    [mutations],
  );

  return {
    openItem,
    handleCreatePage,
    handleCreateFolder,
    handleDelete,
    handleSetFolderColor,
    submitRename,
    renameTarget,
    setRenameTarget,
    newFolderOpen,
    setNewFolderOpen,
  };
}
