"use client";

import {
  type ExplorerBreadcrumbSegment,
  InspectorShell,
  type ExplorerSortValue,
  type ExplorerViewMode,
} from "@/components/wiki/explorer";
import { WikiFolderNameDialog } from "@/components/pages/WikiFolderNameDialog";
import { useExplorerActions } from "@/components/wiki/explorer-hooks/useExplorerActions";
import { useExplorerDnd } from "@/components/wiki/explorer-hooks/useExplorerDnd";
import { useExplorerFolder } from "@/components/wiki/explorer-hooks/useExplorerFolder";
import {
  ancestryLabelFor,
  buildExplorerItems,
  computeFolderItemCounts,
  computeSearchHits,
} from "@/components/wiki/explorer-hooks/explorer-items";
import { useExplorerKeyboard } from "@/components/wiki/explorer-hooks/useExplorerKeyboard";
import { useExplorerMutations } from "@/components/wiki/explorer-hooks/useExplorerMutations";
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
import type { FolderRow } from "@/lib/pages/folder-projects";
import { buildChildrenMap } from "@/lib/pages/folder-dnd";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface WikiExplorerProps {
  userId: string;
  pages: PageWithProjects[];
  folders: FolderRow[];
}

/**
 * The wiki home surface. Owns folder drill-down, dnd, selection, keyboard,
 * inspector, search, and view rendering. Reads pages+folders from its parent
 * (which has the TanStack queries + realtime subscriptions wired) and fires the
 * server actions via {@link useExplorerMutations} for optimistic patches.
 */
export function WikiExplorer({ userId, pages, folders }: WikiExplorerProps) {
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
    if (s === "manual" || s === "name" || s === "updated") setSort(s);
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
    [folders, pages, folderId, sort, counts],
  );
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
    [pages, folders, search, searchActive],
  );

  const itemOrder = useMemo(() => visibleItems.map(explorerItemId), [visibleItems]);

  // ─── Selection engine keyed to the current visible order. ────────────
  const selection = useExplorerSelection();
  useEffect(() => {
    selection.setOrder(itemOrder);
  }, [itemOrder, selection]);
  useEffect(() => {
    selection.clear();
    // Only when the folder changes, not on every itemOrder tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId]);

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
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
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
    [selection, visibleItems],
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
  const wrapItemForContextMenu = useCallback(
    (item: ExplorerItem, node: ReactNode) => (
      <ExplorerItemContextMenu
        item={item}
        onOpen={openItem}
        onRename={(it) => setRenameTarget(it)}
        onDelete={handleDelete}
      >
        {node}
      </ExplorerItemContextMenu>
    ),
    [handleDelete, openItem, setRenameTarget],
  );

  const wrapItemForListView = useCallback(
    (item: ExplorerItem, node: ReactNode) => {
      const wrapped = wrapItemForContextMenu(item, node);
      if (sort !== "manual" || item.kind !== "page") return wrapped;
      return <ReorderPageWrapper id={item.id}>{wrapped}</ReorderPageWrapper>;
    },
    [sort, wrapItemForContextMenu],
  );

  const isEmptyWiki = pages.length === 0 && folders.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={dnd.handleDragStart}
        onDragEnd={dnd.handleDragEnd}
        onDragCancel={dnd.handleDragCancel}
      >
        <div className="flex overflow-hidden rounded-[12px] border border-[var(--sd-line)] bg-[var(--sd-box)]">
          <div className="flex min-w-0 flex-1 flex-col">
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
              onItemOpen={openItem}
              onSearchPageOpen={(page) => router.push(`/wiki/${page.id}`)}
              renderItemChromeGrid={wrapItemForContextMenu}
              renderItemChromeList={wrapItemForListView}
              onCreatePage={handleCreatePage}
              onOpenNewFolder={() => setNewFolderOpen(true)}
            />
          </div>

          <InspectorShell
            open={inspectorOpen}
            header={
              <div className="font-mono text-[0.68rem] uppercase tracking-[0.09em] text-[var(--ink-muted)]">
                Inspector
              </div>
            }
          >
            <ExplorerInspectorPanel
              items={selectedItems}
              ancestryLabel={inspectorAncestry}
              onOpen={openItem}
              onRename={(it) => setRenameTarget(it)}
              onDelete={handleDelete}
            />
          </InspectorShell>
        </div>

        <DragOverlay dropAnimation={null}>
          {dnd.activeDrag ? (
            <DragCountBadge label={dnd.activeLabel} count={dnd.dragBag.length} />
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
