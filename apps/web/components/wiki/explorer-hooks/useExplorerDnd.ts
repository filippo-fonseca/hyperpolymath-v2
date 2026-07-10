"use client";

import {
  parseExplorerDragId,
  parseExplorerDropId,
} from "@/components/wiki/explorer-hooks/explorer-items";
import type { useExplorerMutations } from "@/components/wiki/explorer-hooks/useExplorerMutations";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { FolderRow } from "@/lib/pages/folder-projects";
import { isSelfOrDescendant } from "@/lib/pages/folder-dnd";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useCallback, useMemo, useState } from "react";

type Mutations = ReturnType<typeof useExplorerMutations>;

interface UseExplorerDndArgs {
  pages: PageWithProjects[];
  folders: FolderRow[];
  childrenOf: Map<string, string[]>;
  selectedIds: Set<string>;
  mutations: Mutations;
}

/** Owns the explorer's dnd state (active id, drag bag, label) + drag start/end handlers. */
export function useExplorerDnd({
  pages,
  folders,
  childrenOf,
  selectedIds,
  mutations,
}: UseExplorerDndArgs) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const activeDrag = activeDragId ? parseExplorerDragId(activeDragId) : null;

  // Multi-item drag: if the primary drag id is inside the current selection,
  // the whole selection travels with it. Otherwise, it's a single-item drag.
  const dragBag = useMemo<string[]>(() => {
    if (!activeDragId) return [];
    if (selectedIds.has(activeDragId)) return Array.from(selectedIds);
    return [activeDragId];
  }, [activeDragId, selectedIds]);

  const activeLabel = useMemo(() => {
    if (!activeDrag) return "";
    if (activeDrag.kind === "folder") {
      const f = folders.find((x) => x.id === activeDrag.id);
      return f?.name ?? "Folder";
    }
    const p = pages.find((x) => x.id === activeDrag.id);
    return p?.title || "Untitled page";
  }, [activeDrag, folders, pages]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
      if (!over) return;
      const drag = parseExplorerDragId(String(active.id));
      if (!drag) return;
      const dropId = String(over.id);
      // Reorder: `reorder-page:<targetId>` — insert dragged page after target.
      if (dropId.startsWith("reorder-page:")) {
        if (drag.kind !== "page") return;
        const targetId = dropId.slice("reorder-page:".length);
        if (targetId === drag.id) return;
        const target = pages.find((p) => p.id === targetId);
        if (!target) return;
        // If dragged is in a different folder, first move it to the target's
        // folder so reorder has a common parent to work in.
        const draggedPage = pages.find((p) => p.id === drag.id);
        if (draggedPage && draggedPage.folderId !== target.folderId) {
          await mutations.movePageTo(drag.id, target.folderId ?? null);
        }
        await mutations.reorder({
          kind: "page",
          id: drag.id,
          afterId: targetId,
          parentId: target.folderId ?? null,
        });
        return;
      }
      const drop = parseExplorerDropId(dropId);
      if (!drop) return;
      const targetFolderId = drop.kind === "folder" ? drop.id : null;
      // Cross-kind cycle guard for folder moves.
      if (drag.kind === "folder" && targetFolderId !== null) {
        if (isSelfOrDescendant(drag.id, targetFolderId, childrenOf)) return;
      }
      // Multi-select page drag → bulk move; single folder or single page → move.
      if (drag.kind === "page" && dragBag.length > 1) {
        const pageIds = dragBag
          .filter((id) => id.startsWith("page:"))
          .map((id) => id.slice("page:".length));
        if (pageIds.length > 0) {
          await mutations.bulkMovePages(pageIds, targetFolderId);
        }
        return;
      }
      if (drag.kind === "page") {
        await mutations.movePageTo(drag.id, targetFolderId);
      } else {
        await mutations.moveFolderTo(drag.id, targetFolderId);
      }
    },
    [childrenOf, dragBag, mutations, pages],
  );

  return {
    activeDrag,
    activeLabel,
    dragBag,
    handleDragStart,
    handleDragCancel,
    handleDragEnd,
  };
}
