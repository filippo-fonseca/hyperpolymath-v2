"use client";

import {
  parseExplorerDragId,
  parseExplorerDropId,
} from "@/components/wiki/explorer-hooks/explorer-items";
import type { useExplorerMutations } from "@/components/wiki/explorer-hooks/useExplorerMutations";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import { isSelfOrDescendant } from "@/lib/pages/folder-dnd";
import type { FolderRow } from "@/lib/pages/folder-projects";
import { compareExplorerItems, withPinnedFirst } from "@/lib/pages/position";
import { playSfx } from "@/lib/sound/ui-sfx";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

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
  const [rejectedDragId, setRejectedDragId] = useState<string | null>(null);
  const [successfulDropId, setSuccessfulDropId] = useState<string | null>(null);
  const rejectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    playSfx("pickup");
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const rejectDrop = useCallback((id: string, message: string) => {
    if (rejectionTimer.current) clearTimeout(rejectionTimer.current);
    setRejectedDragId(id);
    playSfx("dropDenied");
    toast.error(message);
    rejectionTimer.current = setTimeout(() => setRejectedDragId(null), 420);
  }, []);

  const acceptDrop = useCallback((targetFolderId?: string | null) => {
    playSfx("dropSuccess");
    if (!targetFolderId) return;
    if (successTimer.current) clearTimeout(successTimer.current);
    setSuccessfulDropId(`folder:${targetFolderId}`);
    successTimer.current = setTimeout(() => setSuccessfulDropId(null), 180);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      const activeId = String(active.id);
      setActiveDragId(null);
      if (!over) {
        rejectDrop(activeId, "Not moved — drop on a folder or breadcrumb.");
        return;
      }
      const drag = parseExplorerDragId(activeId);
      if (!drag) {
        rejectDrop(activeId, "Not moved — that item can’t be dragged.");
        return;
      }
      const dropId = String(over.id);
      // Reorder: `reorder-page:<targetId>` — insert dragged page after target.
      if (dropId.startsWith("reorder-page:")) {
        if (drag.kind !== "page" || dragBag.length > 1) {
          rejectDrop(activeId, "Drop the selection on a folder or breadcrumb to move it.");
          return;
        }
        const targetId = dropId.slice("reorder-page:".length);
        if (targetId === drag.id) {
          rejectDrop(activeId, "Not moved — choose a different position.");
          return;
        }
        const target = pages.find((p) => p.id === targetId);
        if (!target) {
          rejectDrop(activeId, "Not moved — the target no longer exists.");
          return;
        }
        // If dragged is in a different folder, first move it to the target's
        // folder so reorder has a common parent to work in.
        const draggedPage = pages.find((p) => p.id === drag.id);
        if (draggedPage && draggedPage.folderId !== target.folderId) {
          await mutations.movePageTo(drag.id, target.folderId ?? null);
        }
        const orderedSiblings = pages
          .filter(
            (page) =>
              page.id !== drag.id &&
              !page.dailyDate &&
              (page.folderId ?? null) === (target.folderId ?? null)
          )
          .sort(
            withPinnedFirst((a, b) =>
              compareExplorerItems(
                { positionKey: a.positionKey, name: a.title },
                { positionKey: b.positionKey, name: b.title }
              )
            )
          );
        const targetIndex = orderedSiblings.findIndex((page) => page.id === targetId);
        const beforeId = orderedSiblings[targetIndex + 1]?.id ?? null;
        await mutations.reorder({
          kind: "page",
          id: drag.id,
          afterId: targetId,
          beforeId,
          parentId: target.folderId ?? null,
        });
        acceptDrop();
        return;
      }
      const drop = parseExplorerDropId(dropId);
      if (!drop) {
        rejectDrop(activeId, "Not moved — drop on a folder or breadcrumb.");
        return;
      }
      const targetFolderId = drop.kind === "folder" ? drop.id : null;
      const bag = dragBag.length > 0 ? dragBag : [activeId];
      const draggedFolders = bag
        .map(parseExplorerDragId)
        .filter((item): item is { kind: "folder"; id: string } => item?.kind === "folder");
      if (
        targetFolderId !== null &&
        draggedFolders.some((item) => isSelfOrDescendant(item.id, targetFolderId, childrenOf))
      ) {
        rejectDrop(activeId, "A folder can’t be moved into itself or one of its subfolders.");
        return;
      }
      const pageIds = bag
        .map(parseExplorerDragId)
        .filter((item): item is { kind: "page"; id: string } => item?.kind === "page")
        .map((item) => item.id);
      await Promise.all([
        pageIds.length > 0 ? mutations.bulkMovePages(pageIds, targetFolderId) : Promise.resolve(),
        ...draggedFolders.map((item) => mutations.moveFolderTo(item.id, targetFolderId)),
      ]);
      acceptDrop(targetFolderId);
    },
    [acceptDrop, childrenOf, dragBag, mutations, pages, rejectDrop]
  );

  return {
    activeDrag,
    activeLabel,
    dragBag,
    rejectedDragId,
    successfulDropId,
    handleDragStart,
    handleDragCancel,
    handleDragEnd,
  };
}
