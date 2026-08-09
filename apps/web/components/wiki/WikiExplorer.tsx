"use client";

import { WikiFolderNameDialog } from "@/components/pages/WikiFolderNameDialog";
import { SidePanel } from "@/components/ui/SidePanel";
import type {
  ExplorerBreadcrumbSegment,
  ExplorerSortValue,
  ExplorerViewMode,
} from "@/components/wiki/explorer";
import {
  ancestryLabelFor,
  buildExplorerItems,
  computeFolderItemCounts,
  computeSearchHits,
} from "@/components/wiki/explorer-hooks/explorer-items";
import { useExplorerActions } from "@/components/wiki/explorer-hooks/useExplorerActions";
import { useExplorerDnd } from "@/components/wiki/explorer-hooks/useExplorerDnd";
import { useExplorerFolder } from "@/components/wiki/explorer-hooks/useExplorerFolder";
import { useExplorerKeyboard } from "@/components/wiki/explorer-hooks/useExplorerKeyboard";
import { useExplorerMutations } from "@/components/wiki/explorer-hooks/useExplorerMutations";
import { useExplorerProjectNames } from "@/components/wiki/explorer-hooks/useExplorerProjectNames";
import { useExplorerSelection } from "@/components/wiki/explorer-hooks/useExplorerSelection";
import { useRubberBandSelection } from "@/components/wiki/explorer-hooks/useRubberBandSelection";
import { DragCountBadge } from "@/components/wiki/explorer-parts/DragCountBadge";
import {
  ExplorerCanvasBody,
  ReorderPageWrapper,
} from "@/components/wiki/explorer-parts/ExplorerCanvasBody";
import { ExplorerHeaderControls } from "@/components/wiki/explorer-parts/ExplorerHeaderControls";
import { ExplorerInspectorPanel } from "@/components/wiki/explorer-parts/ExplorerInspectorPanel";
import { ExplorerItemContextMenu } from "@/components/wiki/explorer-parts/ExplorerItemContextMenu";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { explorerItemId } from "@/components/wiki/explorer-types";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import { buildChildrenMap } from "@/lib/pages/folder-dnd";
import {
  type FolderProjectLink,
  type FolderRow,
  type FolderWithProjects,
  getInheritedProjectIds,
} from "@/lib/pages/folder-projects";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface WikiExplorerProps {
  userId: string;
  pages: PageWithProjects[];
  folders: FolderRow[];
  folderProjects: FolderProjectLink[];
  projects: { id: string; name: string }[];
}

const EXPLORER_DRAG_ACTIVATION_DISTANCE = 6;

/**
 * The wiki home surface. Owns folder drill-down, dnd, selection, keyboard,
 * inspector, search, and view rendering. Reads pages+folders from its parent
 * (which has the TanStack queries + realtime subscriptions wired) and fires the
 * server actions via {@link useExplorerMutations} for optimistic patches.
 */
export function WikiExplorer({
  userId,
  pages,
  folders,
  folderProjects,
  projects,
}: WikiExplorerProps) {
  const router = useRouter();
  const mutations = useExplorerMutations(userId);

  // ─── View / sort / inspector — localStorage-persisted after mount. ──
  const [view, setView] = useState<ExplorerViewMode>("grid");
  const [sort, setSort] = useState<ExplorerSortValue>("manual");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  useEffect(() => {
    const v = localStorage.getItem("wiki:view");
    if (v === "grid" || v === "list") setView(v);
    const s = localStorage.getItem("wiki:sort");
    if (s === "manual" || s === "name" || s === "updated" || s === "created") setSort(s);
    const insp = localStorage.getItem("wiki:inspector");
    if (insp === "1") setInspectorOpen(true);
  }, []);
  const setViewMode = useCallback((v: ExplorerViewMode) => {
    setView(v);
    localStorage.setItem("wiki:view", v);
  }, []);
  const setSortMode = useCallback((s: ExplorerSortValue) => {
    setSort(s);
    localStorage.setItem("wiki:sort", s);
  }, []);
  const toggleInspector = useCallback(() => {
    setInspectorOpen((prev) => {
      const next = !prev;
      localStorage.setItem("wiki:inspector", next ? "1" : "0");
      return next;
    });
  }, []);
  // The SidePanel host also closes the panel on Escape and on route change, so
  // the close path has to persist the same way the toggle does or the inspector
  // reopens on the next visit.
  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    localStorage.setItem("wiki:inspector", "0");
  }, []);

  // ─── Folder navigation + ancestry. ────────────────────────────────────
  const folderNav = useExplorerFolder(folders);
  const { folderId, setFolderId, canGoBack, canGoForward, goBack, goForward, ancestry } = folderNav;

  // ─── Search — filters live; when active, switches to flat results. ────
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchActive = search.trim().length > 0;

  // ─── Item list for the current folder + counts. ──────────────────────
  const counts = useMemo(() => computeFolderItemCounts(folders, pages), [folders, pages]);
  const currentItems = useMemo(
    () => buildExplorerItems(folders, pages, folderId, sort, counts),
    [folders, pages, folderId, sort, counts]
  );
  const folderProjectNames = useExplorerProjectNames(folders, folderProjects, projects);
  const visibleItems = useMemo(() => {
    if (!searchActive) return currentItems;
    const q = search.trim().toLowerCase();
    return currentItems.filter((item) => {
      const label = item.kind === "folder" ? item.folder.name : item.page.title || "Untitled";
      return label.toLowerCase().includes(q);
    });
  }, [currentItems, search, searchActive]);
  const searchHits = useMemo(
    () => (searchActive ? computeSearchHits(pages, folders, search) : []),
    [pages, folders, search, searchActive]
  );

  const itemOrder = useMemo(() => visibleItems.map(explorerItemId), [visibleItems]);

  // ─── Selection engine keyed to the current visible order. ────────────
  const selection = useExplorerSelection();
  // Depend on the stable `setOrder` identity, not on the whole `selection`
  // object: that object is re-memoized on every selection state change, so
  // keying this effect on it re-ran the order sync for reasons unrelated to
  // the order.
  const setSelectionOrder = selection.setOrder;
  useEffect(() => {
    setSelectionOrder(itemOrder);
  }, [itemOrder, setSelectionOrder]);
  // Selection must not survive a folder change. The breadcrumb and drill-down
  // handlers clear it themselves, but browser Back/Forward moves `folderId`
  // through nuqs without passing through either, so this stays as the backstop.
  // It fires on a real change of folder, compared against the last one seen:
  // the old `folderId !== undefined` guard was always true (folderId is
  // `string | null`), so it cleared on every run. `clear()` also bails out now
  // when nothing is selected, so the common path costs no extra render.
  const clearSelection = selection.clear;
  const lastClearedFolder = useRef(folderId);
  useEffect(() => {
    if (lastClearedFolder.current === folderId) return;
    lastClearedFolder.current = folderId;
    clearSelection();
  }, [clearSelection, folderId]);

  // ─── Rubber-band on empty canvas. ────────────────────────────────────
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const rubberBand = useRubberBandSelection({
    containerRef: canvasRef,
    onSelection: (ids) => selection.selectOnly(ids),
    itemSelector: "[data-explorer-id]",
    ignoreSelector: "[data-explorer-id]",
  });

  // ─── Dnd. ────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: EXPLORER_DRAG_ACTIVATION_DISTANCE },
    }),
    useSensor(KeyboardSensor)
  );
  const childrenOf = useMemo(() => buildChildrenMap(folders), [folders]);
  const dnd = useExplorerDnd({
    pages,
    folders,
    childrenOf,
    selectedIds: selection.selected,
    mutations,
  });

  // ─── Handlers + rename/new-folder dialog state. ──────────────────────
  const actions = useExplorerActions({
    mutations,
    folders,
    folderId,
    setFolderId,
    clearSelection: selection.clear,
    childrenOf,
  });
  const {
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
  } = actions;

  // ─── Keyboard: /, cmd+A, Esc, Enter, arrows, Cmd+I. ─────────────────
  useExplorerKeyboard({
    selection,
    itemOrder,
    visibleItems,
    openItem,
    toggleInspector,
    view,
    canvasRef,
    searchInputRef,
  });

  // ─── Inspector content. ──────────────────────────────────────────────
  const selectedItems = useMemo(
    () => visibleItems.filter((it) => selection.isSelected(explorerItemId(it))),
    [selection, visibleItems]
  );
  const inspectorAncestry = useMemo(() => {
    if (selectedItems.length !== 1) return ancestryLabelFor(folderId, folders);
    const only = selectedItems[0];
    if (only.kind === "folder") return ancestryLabelFor(only.folder.parentId, folders);
    return ancestryLabelFor(only.page.folderId ?? null, folders);
  }, [selectedItems, folderId, folders]);

  // ─── Breadcrumbs (root + each ancestor as drop targets). ─────────────
  const breadcrumbSegments: ExplorerBreadcrumbSegment[] = useMemo(() => {
    const rootId = "breadcrumb-root";
    const segments: ExplorerBreadcrumbSegment[] = [
      {
        id: rootId,
        label: "Wiki",
        current: folderId === null,
        buttonProps: {
          onClick: () => {
            setFolderId(null);
            selection.clear();
          },
        },
      },
    ];
    for (let i = 0; i < ancestry.length; i++) {
      const f = ancestry[i];
      const last = i === ancestry.length - 1;
      segments.push({
        id: `breadcrumb:${f.id}`,
        label: f.name,
        current: last,
        buttonProps: {
          onClick: () => {
            setFolderId(f.id);
            selection.clear();
          },
        },
      });
    }
    return segments;
  }, [ancestry, folderId, selection, setFolderId]);

  // ─── Chrome renderers for context menus + optional reorder drop. ────
  // Own vs inherited links, kept apart: the menu can only edit a folder's own
  // row, and has to say so for the ones that arrive from an ancestor.
  const ownProjectIdsByFolder = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const link of folderProjects) {
      const list = map.get(link.folderId);
      if (list) list.push(link.projectId);
      else map.set(link.folderId, [link.projectId]);
    }
    return map;
  }, [folderProjects]);
  const folderWithProjectsMap = useMemo(() => {
    return new Map<string, FolderWithProjects>(
      folders.map((folder) => [
        folder.id,
        { ...folder, ownProjectIds: ownProjectIdsByFolder.get(folder.id) ?? [] },
      ])
    );
  }, [folders, ownProjectIdsByFolder]);

  const wrapItemForContextMenu = useCallback(
    (item: ExplorerItem, node: ReactNode) => (
      <ExplorerItemContextMenu
        item={item}
        onOpen={openItem}
        onRename={(it) => setRenameTarget(it)}
        onDelete={handleDelete}
        onToggleStar={(it) => {
          if (it.kind === "page") void mutations.toggleStar(it.id, !it.page.pinned);
        }}
        onSetFolderColor={(folderId, color) => void handleSetFolderColor(folderId, color)}
        projects={projects}
        ownProjectIds={item.kind === "folder" ? ownProjectIdsByFolder.get(item.id) : undefined}
        inheritedProjectIds={
          item.kind === "folder"
            ? getInheritedProjectIds(item.id, folderWithProjectsMap)
            : undefined
        }
        onSetFolderProjects={(folderId, projectIds) =>
          void mutations.setFolderProjectLinks(folderId, projectIds)
        }
      >
        {node}
      </ExplorerItemContextMenu>
    ),
    [
      folderWithProjectsMap,
      handleDelete,
      handleSetFolderColor,
      mutations,
      openItem,
      ownProjectIdsByFolder,
      projects,
      setRenameTarget,
    ]
  );

  const wrapItemForListView = useCallback(
    (item: ExplorerItem, node: ReactNode) => {
      const wrapped = wrapItemForContextMenu(item, node);
      if (sort !== "manual" || item.kind !== "page") return wrapped;
      return <ReorderPageWrapper id={item.id}>{wrapped}</ReorderPageWrapper>;
    },
    [sort, wrapItemForContextMenu]
  );

  const isEmptyWiki = pages.length === 0 && folders.length === 0;

  // No `wiki-explorer` class on the wrapper — and as of aug-04 craft-ui-v2 no
  // such scope exists in globals.css at all. The --sd-* aliases resolve against
  // the global register (app accent hue 225, base surfaces, base inks), so the
  // explorer reads as part of the page in both light and dark.
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <DndContext
        id="wiki-explorer-dnd"
        sensors={sensors}
        collisionDetection={(args) => {
          const pointerHits = pointerWithin(args);
          return pointerHits.length > 0 ? pointerHits : rectIntersection(args);
        }}
        // WhileDragging, not Always. Under `Always`, dnd-kit re-measures every
        // registered droppable on every DndContext render, and each grid tile
        // registers a droppable and a draggable, plus one droppable per
        // breadcrumb segment and one for the canvas. N tiles meant N forced
        // getBoundingClientRect() calls and a synchronous layout flush on every
        // keystroke in the search box and every folder navigation. Drop targets
        // only need to be measured while a drag is actually in flight.
        measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging } }}
        onDragStart={dnd.handleDragStart}
        onDragEnd={dnd.handleDragEnd}
        onDragCancel={dnd.handleDragCancel}
      >
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--sd-line)] bg-[var(--sd-app)] shadow-[var(--shadow-card)]">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ExplorerHeaderControls
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onBack={goBack}
              onForward={goForward}
              breadcrumbSegments={breadcrumbSegments}
              search={search}
              onSearchChange={setSearch}
              searchInputRef={searchInputRef}
              onCreatePage={handleCreatePage}
              onCreateFolder={() => setNewFolderOpen(true)}
              view={view}
              onViewChange={setViewMode}
              sort={sort}
              onSortChange={setSortMode}
              inspectorOpen={inspectorOpen}
              onToggleInspector={toggleInspector}
            />

            <ExplorerCanvasBody
              canvasRef={canvasRef}
              onCanvasPointerDown={rubberBand.onPointerDown}
              rubberBandRect={rubberBand.rect}
              searchActive={searchActive}
              search={search}
              searchHits={searchHits}
              isEmptyWiki={isEmptyWiki}
              visibleItems={visibleItems}
              view={view}
              isSelected={selection.isSelected}
              onItemClick={selection.onItemClick}
              cursor={selection.cursor}
              rejectedDragId={dnd.rejectedDragId}
              successfulDropId={dnd.successfulDropId}
              onItemOpen={openItem}
              onSearchPageOpen={(page) => router.push(`/wiki/${page.id}`)}
              renderItemChromeGrid={wrapItemForContextMenu}
              renderItemChromeList={wrapItemForListView}
              folderProjectNames={folderProjectNames}
              onCreatePage={handleCreatePage}
              onOpenNewFolder={() => setNewFolderOpen(true)}
            />
          </div>
        </div>

        {/* The inspector lives in the cockpit's shared right slot (SDC-1 §2.2,
            §2.8): opening it slides the Dock out and narrows the stage, so wiki
            and tasks share one detail affordance instead of a bespoke aside. */}
        <SidePanel open={inspectorOpen} onClose={closeInspector} title="Inspector" width={320}>
          <ExplorerInspectorPanel
            items={selectedItems}
            ancestryLabel={inspectorAncestry}
            onOpen={openItem}
            onRename={(it) => setRenameTarget(it)}
            onDelete={handleDelete}
          />
        </SidePanel>

        <DragOverlay style={{ width: "max-content", height: "auto" }}>
          {dnd.activeDrag ? (
            <DragCountBadge
              kind={dnd.activeDrag.kind}
              label={dnd.activeLabel}
              count={dnd.dragBag.length}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <WikiFolderNameDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        title="New folder"
        submitLabel="Create"
        onSubmit={(name) => handleCreateFolder(name)}
      />
      <WikiFolderNameDialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        title={renameTarget?.kind === "folder" ? "Rename folder" : "Rename page"}
        initialValue={
          renameTarget
            ? renameTarget.kind === "folder"
              ? renameTarget.folder.name
              : renameTarget.page.title
            : ""
        }
        placeholder={renameTarget?.kind === "folder" ? "Folder name" : "Page title"}
        submitLabel="Save"
        onSubmit={submitRename}
      />
    </div>
  );
}
