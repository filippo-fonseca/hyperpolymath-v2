"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  defaultDropAnimationSideEffects,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, MoreHorizontal, Folder } from "lucide-react";
import { reorderAreas } from "@/app/actions/areas";
import {
  reorderProjects,
  moveProjectToArea,
  archiveProject,
  unarchiveProject,
  deleteProject,
  updateProject,
} from "@/app/actions/projects";
import { AreaActionsMenu } from "@/components/areas/AreaContextMenu";
import { DynamicIcon } from "@/components/projects/DynamicIcon";
import { EmptyState } from "@/components/shared/EmptyState";
import { useUndoToast } from "@/components/shared/use-undo-toast";
import { archiveArea, unarchiveArea } from "@/app/actions/areas";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SidebarArea, SidebarProject } from "@/lib/db/queries/sidebar";
import type { AreaOptimisticDispatch } from "./Sidebar";
import { cn } from "@/lib/utils";

// ID prefix used to distinguish project drags from area drags in the unified DndContext
const PROJECT_PREFIX = "project:";

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

interface Props {
  userId: string;
  areas: SidebarArea[];
  collapsed: boolean;
  graduationYear?: number | null;
  addOptimisticArea: AreaOptimisticDispatch;
}

/**
 * SidebarTree — Phase 3 migration of the manual drag/drop + context-menu tree.
 *
 * Optimistic ownership split (M3):
 * - Areas useOptimistic lives in Sidebar.tsx (parent) and is passed in as
 *   `addOptimisticArea` because AreaCreateDialog is a sibling that also mutates.
 * - Projects useOptimistic lives HERE because all project mutations originate
 *   from this tree (drag reorder, drag across area via menu, rename/archive).
 *
 * Realtime subscriptions for both `areas` and `projects` are owned by
 * Sidebar.tsx — refcounted singleton means re-mounting here is a no-op.
 */
export function SidebarTree({
  userId,
  areas,
  collapsed,
  graduationYear,
  addOptimisticArea,
}: Props) {
  void userId; // currently consumed by the parent Sidebar; reserved for future per-tree subs

  // Project-level optimistic order applied across all areas. Reducer accepts
  // a partial id list (e.g. reorder one area's projects only) and keeps the
  // rest at the tail — see optimistic-reducer.ts.
  const [optimisticAreas, applyProjectReorder] = useOptimistic(
    areas,
    (current: SidebarArea[], next: SidebarArea[]) => next,
  );

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Phase 6 Plan 06-02 (RES-02): sonner Undo toast for area archive flow.
  // Replaces AreaContextMenu's inline toast.action({label: "Undo"}) pattern
  // with the shared useUndoToast helper.
  //
  // Semantics adapted for archive (vs hard-delete on Tasks/Captures):
  //   - The server archive commits IMMEDIATELY so Realtime fans the change
  //     out to other windows. The 5s undo window lets the same window roll
  //     it back via unarchiveArea() if the user clicks Undo.
  //   - This differs from useUndoToast's typical "delay commit by 5s"
  //     pattern but matches what the existing inline pattern already did;
  //     we're just routing the toast UX through the shared helper.
  const { show: showUndoToast } = useUndoToast();
  const handleArchiveAreaWithUndo = (areaId: string, areaName: string) => {
    // 1. Optimistic remove + immediate server archive (D-04 + cross-window).
    startTransition(async () => {
      addOptimisticArea({ type: "delete", id: areaId });
      const r = await archiveArea(areaId);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      // 2. Toast with 5s Undo (RES-02 / UI-SPEC §8h). Commit is a no-op
      //    (already committed); Undo calls unarchiveArea.
      showUndoToast({
        message: `Area "${areaName}" archived`,
        optimisticRemove: () => {
          /* already done above */
        },
        commit: () => {
          /* server commit already happened pre-toast for cross-window propagation */
        },
        undo: async () => {
          const u = await unarchiveArea(areaId);
          if (!u.success) {
            toast.error(u.error);
          }
          // Realtime echo restores the row in the active list.
        },
        addBack: () => {
          /* Optimistic restoration handled by the Realtime echo on unarchive. */
        },
      });
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const isDraggingProject = activeIdStr.startsWith(PROJECT_PREFIX);

    if (!isDraggingProject) {
      // Area drag — reorder areas (uses Sidebar's areas useOptimistic via prop)
      const oldIndex = optimisticAreas.findIndex((a) => a.id === activeIdStr);
      const newIndex = optimisticAreas.findIndex((a) => a.id === overIdStr);
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(optimisticAreas, oldIndex, newIndex);
      const orderedIds = next.map((a) => a.id);
      startTransition(async () => {
        // D-04: optimistic reorder via Sidebar's dispatcher
        addOptimisticArea({ type: "reorder", ids: orderedIds });
        const result = await reorderAreas({ orderedIds });
        if (!result.success) {
          // D-03: silent revert + toast.error
          toast.error(result.error);
          return;
        }
        // Realtime echo invalidates ['areas', userId] → refetch.
      });
      return;
    }

    // Project drag — reorder within source area only.
    // Cross-area moves happen via the ⋯ menu "Move to area..." submenu.
    const projectId = activeIdStr.slice(PROJECT_PREFIX.length);
    if (!overIdStr.startsWith(PROJECT_PREFIX)) return;
    const targetProjectId = overIdStr.slice(PROJECT_PREFIX.length);

    const sourceArea = optimisticAreas.find((a) =>
      a.projects.some((p) => p.id === projectId),
    );
    const targetArea = optimisticAreas.find((a) =>
      a.projects.some((p) => p.id === targetProjectId),
    );
    if (!sourceArea || !targetArea) return;
    if (sourceArea.id !== targetArea.id) return;

    const oldIndex = sourceArea.projects.findIndex((p) => p.id === projectId);
    const newIndex = sourceArea.projects.findIndex(
      (p) => p.id === targetProjectId,
    );
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedProjects = arrayMove(
      sourceArea.projects,
      oldIndex,
      newIndex,
    );
    const orderedIds = reorderedProjects.map((p) => p.id);

    // D-04: optimistic project reorder — splice the new array into the area
    const nextAreas = optimisticAreas.map((a) =>
      a.id === sourceArea.id ? { ...a, projects: reorderedProjects } : a,
    );
    startTransition(async () => {
      applyProjectReorder(nextAreas);
      const result = await reorderProjects({
        areaId: sourceArea.id,
        orderedIds,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      // Realtime echo invalidates ['projects', userId] → refetch.
    });
  }

  if (optimisticAreas.length === 0) {
    // Phase 6 Plan 06-02 (RES-03, AES-04, UI-SPEC §9): brand-voice empty state.
    // Compact py-12 override fits inside the sidebar's narrow width.
    // No action button — the "+ New Area" trigger is rendered by Sidebar.tsx
    // immediately above this tree as a sibling element (least-invasive
    // wiring choice; documented in 06-02 SUMMARY).
    if (collapsed) {
      // Collapsed sidebar: keep the original compact text-only fallback to
      // avoid wrapping the EmptyState H2 in a 48px-wide rail. Mono register
      // matches the surrounding sidebar chrome (UI-SPEC §5e).
      return (
        <div className="px-4 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          No areas yet.
        </div>
      );
    }
    return (
      <EmptyState
        className="py-12"
        heading="No areas yet."
        body="Areas are the chapters. Start with one — Work, School, Life."
      />
    );
  }

  // Find the active drag item for DragOverlay
  const activeDragIsProject = activeDragId?.startsWith(PROJECT_PREFIX);
  const activeDragProjectId = activeDragIsProject
    ? activeDragId!.slice(PROJECT_PREFIX.length)
    : null;
  const activeProject = activeDragProjectId
    ? optimisticAreas
        .flatMap((a) => a.projects)
        .find((p) => p.id === activeDragProjectId)
    : null;
  const activeArea =
    !activeDragIsProject && activeDragId
      ? optimisticAreas.find((a) => a.id === activeDragId)
      : null;

  // All area IDs for the outer SortableContext
  const allAreaIds = optimisticAreas.map((a) => a.id);

  return (
    <DndContext
      id="sidebar-tree"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragId(null)}
    >
      <SortableContext
        id="sidebar-areas"
        items={allAreaIds}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-1 px-2">
          {optimisticAreas.map((area) => (
            <SortableAreaRow
              key={area.id}
              area={area}
              allAreas={optimisticAreas}
              collapsed={collapsed}
              graduationYear={graduationYear ?? null}
              addOptimisticArea={addOptimisticArea}
              onArchiveWithUndo={handleArchiveAreaWithUndo}
            />
          ))}
        </ul>
      </SortableContext>

      <DragOverlay dropAnimation={dropAnimation}>
        {activeArea ? (
          // Drag overlay for an area row — preserve the mono uppercase register
          // (UI-SPEC §5e) so the visual matches what the user grabbed.
          <div
            className={cn(
              "glass-button flex items-center gap-2.5 rounded-xl px-2 py-1.5 select-none cursor-grabbing",
              "font-serif text-[13px] tracking-tight font-medium text-[var(--ink)]",
            )}
            style={{ width: collapsed ? 48 : 244 }}
          >
            <span className="sidebar-chip shrink-0 text-[13px] leading-none">
              {activeArea.emoji ?? "·"}
            </span>
            {!collapsed && (
              <span className="truncate flex-1 min-w-0">{activeArea.name}</span>
            )}
          </div>
        ) : activeProject ? (
          // Drag overlay for a project row — serif register (UI-SPEC §5e
          // project sub-rows render serif).
          <div
            className={cn(
              "glass-button flex items-center gap-2 rounded-lg px-2 py-1 select-none cursor-grabbing",
              "font-serif text-[13px] tracking-tight text-[var(--ink)]",
            )}
            style={{ width: collapsed ? 48 : 220 }}
          >
            <DynamicIcon name={activeProject.icon} size={14} />
            {!activeProject.icon && (
              <span className="opacity-40">·</span>
            )}
            {!collapsed && (
              <span className="truncate flex-1 min-w-0">
                {activeProject.name}
              </span>
            )}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Sortable Area Row ────────────────────────────────────────────────────────

function SortableAreaRow({
  area,
  allAreas,
  collapsed,
  graduationYear,
  addOptimisticArea,
  onArchiveWithUndo,
}: {
  area: SidebarArea;
  allAreas: SidebarArea[];
  collapsed: boolean;
  graduationYear: number | null;
  addOptimisticArea: AreaOptimisticDispatch;
  onArchiveWithUndo?: (areaId: string, areaName: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: area.id });

  const pathname = usePathname();
  const isActive = pathname === `/areas/${area.id}`;
  const [rightClickOpen, setRightClickOpen] = useState(false);
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);

  // Lazy import to avoid circular deps — areas prop passed in from outside
  const [ProjectCreateDialogComponent, setProjectCreateDialogComponent] =
    useState<React.ComponentType<{
      open: boolean;
      onOpenChange: (open: boolean) => void;
      defaultAreaId?: string;
      areas: { id: string; name: string }[];
      graduationYear: number | null;
    }> | null>(null);

  async function openProjectCreate() {
    if (!ProjectCreateDialogComponent) {
      const mod = await import("@/components/projects/ProjectCreateDialog");
      setProjectCreateDialogComponent(() => mod.ProjectCreateDialog);
    }
    setProjectCreateOpen(true);
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const projectIds = area.projects.map((p) => `${PROJECT_PREFIX}${p.id}`);

  return (
    <li
      ref={setSortableRef}
      style={style}
      className={cn("flex flex-col", isDragging && "opacity-0")}
    >
      {/* Area row — glassy pill register: emoji chip + serif label */}
      <div
        {...attributes}
        {...listeners}
        onContextMenu={(e) => {
          e.preventDefault();
          setRightClickOpen(true);
        }}
        className={cn(
          "group/area sidebar-row flex items-center gap-2.5 px-2 py-1.5 select-none",
          // Clean serif label — pill-based register replaces the flat mono caps
          "font-serif text-[13px] tracking-tight text-[var(--ink)]",
          "cursor-grab active:cursor-grabbing",
          isActive && "sidebar-row-active sidebar-row-active-area",
          // D-02: no opacity dim on pending — UI stays instant
          area.archivedAt && "opacity-50 italic line-through",
        )}
      >
        <span className="sidebar-chip shrink-0 text-[13px] leading-none">
          {area.emoji ?? "·"}
        </span>
        {!collapsed && (
          <>
            <span className="truncate flex-1 min-w-0 font-medium">
              {area.name}
            </span>
            {/* + New Project button */}
            <button
              type="button"
              aria-label={`New project in ${area.name}`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                openProjectCreate();
              }}
              className={cn(
                "sidebar-ghost-btn flex items-center justify-center h-5 w-5",
                "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                "opacity-0 group-hover/area:opacity-100 transition-opacity duration-100 ease-out",
                "outline-none",
              )}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <AreaActionsMenu
              areaId={area.id}
              areaName={area.name}
              isArchived={!!area.archivedAt}
              rightClickOpen={rightClickOpen}
              onRightClickClose={() => setRightClickOpen(false)}
              addOptimisticArea={addOptimisticArea}
              onArchiveWithUndo={onArchiveWithUndo}
            />
          </>
        )}
      </div>

      {/* Project list */}
      {!collapsed && (
        <SortableContext
          id={`sidebar-projects-${area.id}`}
          items={projectIds}
          strategy={verticalListSortingStrategy}
        >
          <ul className="sidebar-tree flex flex-col gap-0.5 mt-1 ml-3 pl-[0.85rem]">
            {area.projects.map((project) => (
              <SortableProjectRow
                key={project.id}
                project={project}
                areaId={area.id}
                allAreas={allAreas}
              />
            ))}
          </ul>
        </SortableContext>
      )}

      {/* Lazy-loaded ProjectCreateDialog */}
      {ProjectCreateDialogComponent && (
        <ProjectCreateDialogComponent
          open={projectCreateOpen}
          onOpenChange={setProjectCreateOpen}
          defaultAreaId={area.id}
          areas={[{ id: area.id, name: area.name }]}
          graduationYear={graduationYear}
        />
      )}
    </li>
  );
}

// ─── Sortable Project Row ─────────────────────────────────────────────────────

function SortableProjectRow({
  project,
  areaId,
  allAreas,
}: {
  project: SidebarProject;
  areaId: string;
  allAreas: SidebarArea[];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${PROJECT_PREFIX}${project.id}` });

  const pathname = usePathname();
  const isActive = pathname === `/projects/${project.id}`;
  const [rightClickOpen, setRightClickOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "sidebar-branch group/project relative",
        isDragging && "opacity-0",
      )}
    >
      <div
        {...attributes}
        {...listeners}
        onContextMenu={(e) => {
          e.preventDefault();
          setRightClickOpen(true);
        }}
        className={cn(
          "sidebar-row group/project flex items-center gap-2 px-2 py-1 select-none",
          // Serif sub-row register (UI-SPEC §5e — project sub-rows in serif)
          "font-serif text-[13px] tracking-tight",
          "cursor-grab active:cursor-grabbing",
          // Active project lifts into a soft glass pill (was a hard left edge).
          isActive
            ? "sidebar-row-active text-[var(--ink)]"
            : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
          project.archivedAt && "opacity-50 italic line-through",
        )}
      >
        {/* Icon or placeholder */}
        {project.icon ? (
          <DynamicIcon name={project.icon} size={14} className="shrink-0" />
        ) : (
          <Folder size={14} strokeWidth={1.5} className="shrink-0 opacity-40" />
        )}

        {/* Clickable name → navigate */}
        <Link
          href={`/projects/${project.id}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="truncate flex-1 min-w-0 hover:no-underline"
        >
          {project.name}
        </Link>

        {/* Context menu trigger */}
        <ProjectActionsMenu
          project={project}
          areaId={areaId}
          allAreas={allAreas}
          rightClickOpen={rightClickOpen}
          onRightClickClose={() => setRightClickOpen(false)}
        />
      </div>
    </li>
  );
}

// ─── Project Actions Menu ─────────────────────────────────────────────────────

function ProjectActionsMenu({
  project,
  areaId,
  allAreas,
  rightClickOpen,
  onRightClickClose,
}: {
  project: SidebarProject;
  areaId: string;
  allAreas: SidebarArea[];
  rightClickOpen: boolean;
  onRightClickClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState(project.name);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [, startTransition] = useTransition();

  // Other areas the project could be moved to (exclude current + archived)
  const otherAreas = allAreas.filter(
    (a) => a.id !== areaId && !a.archivedAt,
  );

  function handleMoveToArea(newAreaId: string) {
    setEffectiveOpen(false);
    startTransition(async () => {
      const result = await moveProjectToArea({
        projectId: project.id,
        newAreaId,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const targetName =
        allAreas.find((a) => a.id === newAreaId)?.name ?? "another area";
      toast(`Moved to ${targetName}.`);
      // Realtime echo invalidates ['projects', userId] → refetch.
    });
  }

  const effectiveOpen = open || !!rightClickOpen;
  const setEffectiveOpen = (next: boolean) => {
    setOpen(next);
    if (!next && rightClickOpen) onRightClickClose?.();
  };

  function handleArchive() {
    setEffectiveOpen(false);
    startTransition(async () => {
      const result = await archiveProject(project.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast("Project archived.", {
        action: {
          label: "Undo",
          onClick: () => {
            startTransition(async () => {
              const undoResult = await unarchiveProject(project.id);
              if (!undoResult.success) {
                toast.error(undoResult.error);
              }
            });
          },
        },
        duration: 4000,
      });
    });
  }

  function handleUnarchive() {
    setEffectiveOpen(false);
    startTransition(async () => {
      const result = await unarchiveProject(project.id);
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  async function handleDelete() {
    setIsDeleting(true);
    const result = await deleteProject(project.id);
    setIsDeleting(false);
    if (!result.success) {
      toast.error(result.error);
      setDeleteDialogOpen(false);
      return;
    }
    toast("Project deleted.");
    setDeleteDialogOpen(false);
    // If currently viewing this project's detail page, route to /today —
    // otherwise rely on Realtime echo to refresh the sidebar in place.
    if (pathname === `/projects/${project.id}`) {
      router.push("/today");
    }
  }

  async function handleRename() {
    if (!renameName.trim() || renameName.trim() === project.name) {
      setRenameDialogOpen(false);
      return;
    }
    setIsRenaming(true);
    const result = await updateProject({
      id: project.id,
      name: renameName.trim(),
    });
    setIsRenaming(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setRenameDialogOpen(false);
    // Realtime echo on ['projects', userId] propagates the rename to every
    // surface using the canonical collection key — including the project
    // detail page (B1 canonical detail-page pattern via select).
  }

  return (
    <>
      <DropdownMenu open={effectiveOpen} onOpenChange={setEffectiveOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Project options"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "sidebar-ghost-btn flex items-center justify-center h-5 w-5",
              "text-[var(--ink-muted)] hover:text-[var(--ink)]",
              "opacity-0 group-hover/project:opacity-100",
              "data-[state=open]:opacity-100 transition-opacity duration-100 ease-out",
              "outline-none",
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onSelect={() => {
              setEffectiveOpen(false);
              setRenameName(project.name);
              setRenameDialogOpen(true);
            }}
          >
            Rename
          </DropdownMenuItem>
          {otherAreas.length > 0 && !project.archivedAt && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Move to area</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52 max-h-72 overflow-y-auto">
                {otherAreas.map((target) => (
                  <DropdownMenuItem
                    key={target.id}
                    onSelect={() => handleMoveToArea(target.id)}
                  >
                    <span className="text-base leading-none">
                      {target.emoji ?? "·"}
                    </span>
                    <span className="truncate">{target.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {project.archivedAt ? (
            // UI-SPEC §12f — "Unarchive" → "Restore"
            <DropdownMenuItem onSelect={handleUnarchive}>
              Restore
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={handleArchive}>
              Archive
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => {
              setEffectiveOpen(false);
              setDeleteDialogOpen(true);
            }}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogDescription>
              This removes the project permanently. Tasks and captures linked to
              it will stay — they just lose the project link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            {/* UI-SPEC §12f — "Cancel" → "Discard changes" */}
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Discard changes
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
              if (e.key === "Escape") setRenameDialogOpen(false);
            }}
            autoFocus
          />
          <DialogFooter>
            {/* UI-SPEC §12f — "Cancel" → "Discard changes" */}
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
            >
              Discard changes
            </Button>
            <Button onClick={handleRename} disabled={isRenaming}>
              {isRenaming ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
