"use client";

import {
  createFolder,
  deleteFolder,
  renameFolder,
} from "@/app/actions/folders";
import { createPage, deletePage, updatePage } from "@/app/actions/pages";
import {
  EmptyState,
  ExplorerBreadcrumbs,
  type ExplorerBreadcrumbSegment,
  ExplorerTopBar,
  InspectorShell,
  SelectionRubberBand,
  SortSelect,
  type ExplorerSortValue,
  ViewToggle,
  type ExplorerViewMode,
} from "@/components/wiki/explorer";
import { WikiFolderNameDialog } from "@/components/pages/WikiFolderNameDialog";
import { useExplorerFolder } from "@/components/wiki/explorer-hooks/useExplorerFolder";
import {
  ancestryLabelFor,
  buildExplorerItems,
  computeFolderItemCounts,
  computeSearchHits,
  parseExplorerDragId,
  parseExplorerDropId,
} from "@/components/wiki/explorer-hooks/explorer-items";
import { useExplorerMutations } from "@/components/wiki/explorer-hooks/useExplorerMutations";
import { useExplorerSelection } from "@/components/wiki/explorer-hooks/useExplorerSelection";
import { useRubberBandSelection } from "@/components/wiki/explorer-hooks/useRubberBandSelection";
import { DragCountBadge } from "@/components/wiki/explorer-parts/DragCountBadge";
import { ExplorerEmptySpaceMenu } from "@/components/wiki/explorer-parts/ExplorerEmptySpaceMenu";
import { ExplorerInspectorPanel } from "@/components/wiki/explorer-parts/ExplorerInspectorPanel";
import { ExplorerItemContextMenu } from "@/components/wiki/explorer-parts/ExplorerItemContextMenu";
import {
  ExplorerGridView,
} from "@/components/wiki/explorer-views/ExplorerGridView";
import { ExplorerListView } from "@/components/wiki/explorer-views/ExplorerListView";
import { ExplorerSearchResults } from "@/components/wiki/explorer-views/ExplorerSearchResults";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { explorerItemId } from "@/components/wiki/explorer-types";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { FolderRow } from "@/lib/pages/folder-projects";
import {
  buildChildrenMap,
  isSelfOrDescendant,
} from "@/lib/pages/folder-dnd";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { PanelRightClose, PanelRightOpen, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

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
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const childrenOf = useMemo(() => buildChildrenMap(folders), [folders]);
  const activeDrag = activeDragId ? parseExplorerDragId(activeDragId) : null;

  // Multi-item drag: if the primary drag id is inside the current selection,
  // the whole selection travels with it. Otherwise, it's a single-item drag.
  const dragBag = useMemo<string[]>(() => {
    if (!activeDragId) return [];
    if (selection.selected.has(activeDragId)) return Array.from(selection.selected);
    return [activeDragId];
  }, [activeDragId, selection.selected]);

  const activeLabel = useMemo(() => {
    if (!activeDrag) return "";
    if (activeDrag.kind === "folder") {
      const f = folders.find((x) => x.id === activeDrag.id);
      return f?.name ?? "Folder";
    }
    const p = pages.find((x) => x.id === activeDrag.id);
    return p?.title || "Untitled page";
  }, [activeDrag, folders, pages]);

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

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

  // ─── Handlers: open + create + rename + delete. ──────────────────────
  const openItem = useCallback(
    (item: ExplorerItem) => {
      if (item.kind === "folder") {
        setFolderId(item.id);
        selection.clear();
        return;
      }
      router.push(`/wiki/${item.id}`);
    },
    [router, selection, setFolderId],
  );

  const [renameTarget, setRenameTarget] = useState<ExplorerItem | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);

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
      if (!r.success) {
        toast.error(r.error);
        mutations.invalidateFolders();
      }
    },
    [folderId, mutations],
  );

  const handleDelete = useCallback(
    async (item: ExplorerItem) => {
      if (item.kind === "page") {
        mutations.patchPages((old) => old.filter((p) => p.id !== item.id));
        const r = await deletePage(item.id);
        if (!r.success) {
          toast.error(r.error);
          mutations.invalidatePages();
        }
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
      if (!r.success) {
        toast.error(r.error);
        mutations.invalidateFolders();
      }
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
        if (!r.success) {
          toast.error(r.error);
          mutations.invalidateFolders();
        }
      }
      setRenameTarget(null);
    },
    [mutations, renameTarget],
  );

  // ─── Keyboard: /, cmd+A, Esc, Enter, arrows, Cmd+I. ─────────────────
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const mod = event.metaKey || event.ctrlKey;
      if (event.key === "/" && !inField) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        selection.clear();
        return;
      }
      if (mod && event.key.toLowerCase() === "a" && !inField) {
        event.preventDefault();
        selection.selectOnly(itemOrder);
        return;
      }
      if (mod && event.key.toLowerCase() === "i" && !inField) {
        event.preventDefault();
        toggleInspector();
        return;
      }
      if (event.key === "Enter" && !inField && selection.cursor) {
        const id = selection.cursor;
        const item = visibleItems.find((it) => explorerItemId(it) === id);
        if (item) {
          event.preventDefault();
          openItem(item);
        }
        return;
      }
      if (
        !inField &&
        (event.key === "ArrowUp" || event.key === "ArrowDown" ||
          event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        event.preventDefault();
        const direction = event.key.replace("Arrow", "").toLowerCase() as
          | "up"
          | "down"
          | "left"
          | "right";
        // Grid uses ~4 columns rough estimate; list is single-column.
        const cols = view === "grid" ? gridColumnCount(canvasRef.current) : 1;
        selection.moveCursor(direction, cols, event.shiftKey);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [itemOrder, openItem, selection, toggleInspector, view, visibleItems]);

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
    [handleDelete, openItem],
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
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveDragId(null)}
      >
        <div className="flex overflow-hidden rounded-[12px] border border-[var(--sd-line)] bg-[var(--sd-box)]">
          <div className="flex min-w-0 flex-1 flex-col">
            <ExplorerTopBar
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onBack={goBack}
              onForward={goForward}
              breadcrumbs={
                <ExplorerBreadcrumbs
                  segments={breadcrumbSegments}
                  renderSegment={(seg, def) => (
                    <BreadcrumbDroppable id={seg.id}>{def}</BreadcrumbDroppable>
                  )}
                />
              }
              search={
                <div className="relative">
                  <Search
                    size={13}
                    strokeWidth={1.8}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]"
                  />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search wiki (press /)"
                    className={cn(
                      "h-7 w-full rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-darker-box)] pl-7 pr-2 text-[0.78rem] text-[var(--ink)] outline-none",
                      "transition-[border-color] duration-[120ms] ease-out",
                      "placeholder:text-[var(--ink-muted)] focus:border-[var(--hud-cyan)]",
                    )}
                  />
                </div>
              }
              controls={
                <>
                  <button
                    type="button"
                    onClick={handleCreatePage}
                    title="New page here"
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-box)] px-2 text-[0.75rem] text-[var(--ink)]",
                      "transition-[background-color] duration-[120ms] ease-out hover:bg-[var(--sd-hover)]",
                    )}
                  >
                    <Plus size={12} strokeWidth={1.8} />
                    New page
                  </button>
                  <ViewToggle value={view} onChange={setViewMode} />
                  <SortSelect value={sort} onValueChange={setSortMode} />
                  <button
                    type="button"
                    onClick={toggleInspector}
                    aria-pressed={inspectorOpen}
                    aria-label={inspectorOpen ? "Close inspector" : "Open inspector"}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-box)] text-[var(--ink-muted)]",
                      "transition-[background-color,color] duration-[120ms] ease-out hover:bg-[var(--sd-hover)] hover:text-[var(--ink)]",
                      inspectorOpen && "text-[var(--hud-cyan)]",
                    )}
                  >
                    {inspectorOpen ? (
                      <PanelRightClose size={14} strokeWidth={1.8} />
                    ) : (
                      <PanelRightOpen size={14} strokeWidth={1.8} />
                    )}
                  </button>
                </>
              }
            />

            <ExplorerEmptySpaceMenu
              onNewPage={handleCreatePage}
              onNewFolder={() => setNewFolderOpen(true)}
            >
              <div
                ref={canvasRef}
                className="relative min-h-[420px] p-4"
                onPointerDown={rubberBand.onPointerDown}
              >
                {searchActive ? (
                  searchHits.length === 0 ? (
                    <EmptyState
                      icon={<Search size={22} strokeWidth={1.5} className="text-[var(--ink-muted)]" />}
                      title="No matches"
                      description={`Nothing in the wiki matches "${search.trim()}".`}
                    />
                  ) : (
                    <ExplorerSearchResults
                      hits={searchHits}
                      onOpen={(page) => router.push(`/wiki/${page.id}`)}
                      onSelect={(page, event) =>
                        selection.onItemClick(`page:${page.id}`, {
                          metaKey: event.metaKey,
                          ctrlKey: event.ctrlKey,
                          shiftKey: event.shiftKey,
                        })
                      }
                      selectedId={selection.cursor}
                    />
                  )
                ) : isEmptyWiki ? (
                  <EmptyState
                    title="A brand new wiki"
                    description="Create your first folder or page and it lands here."
                    action={
                      <>
                        <button
                          type="button"
                          onClick={handleCreatePage}
                          className={cn(
                            "flex items-center gap-1.5 rounded-[6px] border border-[var(--sd-line)] px-3 py-1.5 text-[0.78rem] text-[var(--ink)]",
                            "hover:bg-[var(--sd-hover)]",
                          )}
                        >
                          <Plus size={12} strokeWidth={1.8} />
                          New page
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewFolderOpen(true)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-[6px] border border-[var(--sd-line)] px-3 py-1.5 text-[0.78rem] text-[var(--ink)]",
                            "hover:bg-[var(--sd-hover)]",
                          )}
                        >
                          <Plus size={12} strokeWidth={1.8} />
                          New folder
                        </button>
                      </>
                    }
                  />
                ) : visibleItems.length === 0 ? (
                  <EmptyState
                    title="Empty folder"
                    description="Drop something in, or make a new page here."
                    action={
                      <button
                        type="button"
                        onClick={handleCreatePage}
                        className={cn(
                          "flex items-center gap-1.5 rounded-[6px] border border-[var(--sd-line)] px-3 py-1.5 text-[0.78rem] text-[var(--ink)]",
                          "hover:bg-[var(--sd-hover)]",
                        )}
                      >
                        <Plus size={12} strokeWidth={1.8} />
                        New page here
                      </button>
                    }
                  />
                ) : view === "grid" ? (
                  <ExplorerGridView
                    items={visibleItems}
                    isSelected={selection.isSelected}
                    onItemClick={selection.onItemClick}
                    onItemOpen={openItem}
                    renderItemChrome={wrapItemForContextMenu}
                  />
                ) : (
                  <ExplorerListView
                    items={visibleItems}
                    isSelected={selection.isSelected}
                    onItemClick={selection.onItemClick}
                    onItemOpen={openItem}
                    renderItemChrome={wrapItemForListView}
                  />
                )}
                {rubberBand.rect ? (
                  <SelectionRubberBand
                    x={rubberBand.rect.x}
                    y={rubberBand.rect.y}
                    width={rubberBand.rect.width}
                    height={rubberBand.rect.height}
                  />
                ) : null}
              </div>
            </ExplorerEmptySpaceMenu>
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
          {activeDrag ? (
            <DragCountBadge label={activeLabel} count={dragBag.length} />
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

function BreadcrumbDroppable({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <span
      ref={setNodeRef}
      className={cn(
        "inline-flex rounded-[6px]",
        isOver && "bg-[color-mix(in_oklch,var(--hud-cyan)_12%,transparent)] shadow-[inset_0_0_0_1px_var(--hud-cyan)]",
      )}
    >
      {children}
    </span>
  );
}

function ReorderPageWrapper({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `reorder-page:${id}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative",
        isOver && "shadow-[inset_0_-2px_0_var(--hud-cyan)]",
      )}
    >
      {children}
    </div>
  );
}

/** Rough column count for keyboard grid nav — reads inline template if the grid rendered. */
function gridColumnCount(container: HTMLElement | null): number {
  if (!container) return 1;
  const grid = container.querySelector<HTMLElement>("[data-view=\"grid\"]");
  if (!grid) return 1;
  const style = window.getComputedStyle(grid);
  const template = style.gridTemplateColumns.split(" ").filter(Boolean);
  return Math.max(1, template.length);
}
