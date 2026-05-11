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
  useDroppable,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { cn } from "@/lib/utils";

// ID prefix used to distinguish project drags from area drags in the unified DndContext
const PROJECT_PREFIX = "project:";

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

interface Props {
  areas: SidebarArea[];
  collapsed: boolean;
  graduationYear?: number | null;
}

/**
 * SidebarTree — extended from Plan 02-01 to support:
 * - Project drag reorder within area (useOptimistic + DragOverlay, same pattern as area drag)
 * - Project drag across areas (drop project on different area → moveProjectToArea)
 * - Project context menu (rename / archive / delete)
 * - "+ New Project" trigger per area (opens ProjectCreateDialog)
 * - Active project highlighting via usePathname
 *
 * WHY per-area SortableContext inside top-level DndContext:
 * dnd-kit best practice for tree with reorderable children + items movable across parents.
 * Each SortableContext provides reorder semantics within its area;
 * the outer DndContext handles cross-area drop via useDroppable on area rows.
 */
export function SidebarTree({ areas, collapsed, graduationYear }: Props) {
  const [optimisticAreas, applyOptimisticOrder] = useOptimistic(
    areas,
    (current: SidebarArea[], orderedIds: string[]) =>
      orderedIds
        .map((id) => current.find((a) => a.id === id))
        .filter((a): a is SidebarArea => Boolean(a)),
  );
  const [pendingDragId, setPendingDragId] = useState<string | null>(null);
  // activeDragId can be area ID or "project:<uuid>"
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

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
      // Area drag — reorder areas
      const oldIndex = optimisticAreas.findIndex((a) => a.id === activeIdStr);
      const newIndex = optimisticAreas.findIndex((a) => a.id === overIdStr);
      if (oldIndex < 0 || newIndex < 0) return;
      const next = arrayMove(optimisticAreas, oldIndex, newIndex);
      const orderedIds = next.map((a) => a.id);
      setPendingDragId(activeIdStr);
      startTransition(async () => {
        applyOptimisticOrder(orderedIds);
        const result = await reorderAreas({ orderedIds });
        setPendingDragId(null);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        router.refresh();
      });
      return;
    }

    // Project drag — determine target
    const projectId = activeIdStr.slice(PROJECT_PREFIX.length);
    const overIsProject = overIdStr.startsWith(PROJECT_PREFIX);
    const overIsArea = !overIsProject;

    // Find source area of the dragged project
    let sourceArea: SidebarArea | undefined;
    for (const area of optimisticAreas) {
      if (area.projects.some((p) => p.id === projectId)) {
        sourceArea = area;
        break;
      }
    }
    if (!sourceArea) return;

    if (overIsProject) {
      const targetProjectId = overIdStr.slice(PROJECT_PREFIX.length);
      // Find target area
      let targetArea: SidebarArea | undefined;
      for (const area of optimisticAreas) {
        if (area.projects.some((p) => p.id === targetProjectId)) {
          targetArea = area;
          break;
        }
      }
      if (!targetArea) return;

      if (sourceArea.id === targetArea.id) {
        // Reorder within area
        const oldIndex = sourceArea.projects.findIndex((p) => p.id === projectId);
        const newIndex = sourceArea.projects.findIndex((p) => p.id === targetProjectId);
        if (oldIndex < 0 || newIndex < 0) return;
        const reorderedProjects = arrayMove(sourceArea.projects, oldIndex, newIndex);
        const orderedIds = reorderedProjects.map((p) => p.id);
        startTransition(async () => {
          const result = await reorderProjects({
            areaId: sourceArea.id,
            orderedIds,
          });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          router.refresh();
        });
      } else {
        // Cross-area move: dropped onto a project in a different area
        startTransition(async () => {
          const result = await moveProjectToArea({
            projectId,
            newAreaId: targetArea.id,
          });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          router.refresh();
        });
      }
    } else if (overIsArea) {
      // Dropped onto an area header directly
      const targetAreaId = overIdStr;
      if (sourceArea.id === targetAreaId) return; // same area, no-op
      startTransition(async () => {
        const result = await moveProjectToArea({
          projectId,
          newAreaId: targetAreaId,
        });
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        router.refresh();
      });
    }
  }

  if (optimisticAreas.length === 0) {
    return (
      <div className="px-4 py-2 text-[13px] font-sans text-muted-foreground">
        No areas yet.
      </div>
    );
  }

  // Find the active drag item for DragOverlay
  const activeDragIsProject = activeDragId?.startsWith(PROJECT_PREFIX);
  const activeDragProjectId = activeDragIsProject
    ? activeDragId!.slice(PROJECT_PREFIX.length)
    : null;
  const activeProject = activeDragProjectId
    ? optimisticAreas.flatMap((a) => a.projects).find((p) => p.id === activeDragProjectId)
    : null;
  const activeArea = !activeDragIsProject && activeDragId
    ? optimisticAreas.find((a) => a.id === activeDragId)
    : null;

  // All project IDs for the outer SortableContext (areas use their own IDs)
  const allAreaIds = optimisticAreas.map((a) => a.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragId(null)}
    >
      <SortableContext
        items={allAreaIds}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-0.5 px-2">
          {optimisticAreas.map((area) => (
            <SortableAreaRow
              key={area.id}
              area={area}
              collapsed={collapsed}
              isPending={pendingDragId === area.id}
              activeDragId={activeDragId}
              graduationYear={graduationYear ?? null}
            />
          ))}
        </ul>
      </SortableContext>

      <DragOverlay dropAnimation={dropAnimation}>
        {activeArea ? (
          <div
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1",
              "text-[13px] font-sans text-foreground select-none",
              "bg-secondary shadow-lg ring-1 ring-ring cursor-grabbing",
            )}
            style={{ width: collapsed ? 48 : 244 }}
          >
            <span className="text-base leading-none shrink-0">
              {activeArea.emoji ?? "·"}
            </span>
            {!collapsed && (
              <span className="truncate flex-1 min-w-0">{activeArea.name}</span>
            )}
          </div>
        ) : activeProject ? (
          <div
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1",
              "text-[13px] font-sans text-muted-foreground select-none",
              "bg-secondary shadow-lg ring-1 ring-ring cursor-grabbing",
            )}
            style={{ width: collapsed ? 48 : 220 }}
          >
            <DynamicIcon name={activeProject.icon} size={14} />
            {!activeProject.icon && (
              <span className="text-muted-foreground/60">·</span>
            )}
            {!collapsed && (
              <span className="truncate flex-1 min-w-0">{activeProject.name}</span>
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
  collapsed,
  isPending,
  activeDragId,
  graduationYear,
}: {
  area: SidebarArea;
  collapsed: boolean;
  isPending: boolean;
  activeDragId: string | null;
  graduationYear: number | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: area.id });

  // Also make this area a droppable zone for cross-area project drops
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: area.id });

  // Combine refs
  const setNodeRef = (el: HTMLLIElement | null) => {
    setSortableRef(el);
    setDroppableRef(el);
  };

  const [rightClickOpen, setRightClickOpen] = useState(false);
  const [projectCreateOpen, setProjectCreateOpen] = useState(false);
  const router = useRouter();

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

  const isDraggingAProject =
    activeDragId !== null && activeDragId.startsWith(PROJECT_PREFIX);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const projectIds = area.projects.map((p) => `${PROJECT_PREFIX}${p.id}`);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex flex-col",
        isDragging && "opacity-0",
      )}
    >
      {/* Area row */}
      <div
        {...attributes}
        {...listeners}
        onContextMenu={(e) => {
          e.preventDefault();
          setRightClickOpen(true);
        }}
        className={cn(
          "group/area relative flex items-center gap-2 rounded-md px-2 py-1",
          "text-[13px] font-sans text-foreground select-none",
          "hover:bg-secondary cursor-grab active:cursor-grabbing transition-colors",
          isPending && "opacity-50",
          area.archivedAt && "opacity-50 italic line-through",
          // Visual drop-zone affordance when dragging a project over this area
          isDraggingAProject && isOver && "bg-accent/10",
        )}
      >
        <span className="text-base leading-none shrink-0">
          {area.emoji ?? "·"}
        </span>
        {!collapsed && (
          <>
            <span className="truncate flex-1 min-w-0">{area.name}</span>
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
                "flex items-center justify-center h-5 w-5 rounded",
                "text-muted-foreground hover:bg-accent hover:text-foreground",
                "opacity-0 group-hover/area:opacity-100 transition-opacity",
                "focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring outline-none",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <AreaActionsMenu
              areaId={area.id}
              areaName={area.name}
              isArchived={!!area.archivedAt}
              rightClickOpen={rightClickOpen}
              onRightClickClose={() => setRightClickOpen(false)}
            />
          </>
        )}
      </div>

      {/* Project list */}
      {!collapsed && (
        <SortableContext
          items={projectIds}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-0.5 pl-4 mt-0.5">
            {area.projects.map((project) => (
              <SortableProjectRow
                key={project.id}
                project={project}
                areaId={area.id}
                onRefresh={() => router.refresh()}
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
  onRefresh,
}: {
  project: SidebarProject;
  areaId: string;
  onRefresh: () => void;
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
        "group/project relative",
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
          "flex items-center gap-1.5 rounded-md px-2 py-1",
          "text-[13px] font-sans text-muted-foreground select-none",
          "hover:bg-secondary hover:text-foreground transition-colors",
          "cursor-grab active:cursor-grabbing",
          isActive && "bg-secondary text-foreground border-l-2 border-accent",
          project.archivedAt && "opacity-50 italic line-through",
        )}
      >
        {/* Icon or placeholder */}
        {project.icon ? (
          <DynamicIcon name={project.icon} size={14} className="shrink-0" />
        ) : (
          <Folder size={14} className="shrink-0 opacity-40" />
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
          rightClickOpen={rightClickOpen}
          onRightClickClose={() => setRightClickOpen(false)}
          onRefresh={onRefresh}
        />
      </div>
    </li>
  );
}

// ─── Project Actions Menu ─────────────────────────────────────────────────────

function ProjectActionsMenu({
  project,
  areaId: _areaId,
  rightClickOpen,
  onRightClickClose,
  onRefresh,
}: {
  project: SidebarProject;
  areaId: string;
  rightClickOpen: boolean;
  onRightClickClose: () => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameName, setRenameName] = useState(project.name);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [, startTransition] = useTransition();

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
              } else {
                onRefresh();
              }
            });
          },
        },
        duration: 4000,
      });
      onRefresh();
    });
  }

  function handleUnarchive() {
    setEffectiveOpen(false);
    startTransition(async () => {
      const result = await unarchiveProject(project.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onRefresh();
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
    onRefresh();
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
    onRefresh();
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
              "flex items-center justify-center h-5 w-5 rounded",
              "text-muted-foreground hover:bg-accent hover:text-foreground",
              "opacity-0 group-hover/project:opacity-100",
              "data-[state=open]:opacity-100 transition-opacity",
              "focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring outline-none",
            )}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onSelect={() => {
              setEffectiveOpen(false);
              setRenameName(project.name);
              setRenameDialogOpen(true);
            }}
          >
            Rename
          </DropdownMenuItem>
          {project.archivedAt ? (
            <DropdownMenuItem onSelect={handleUnarchive}>
              Unarchive
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
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Never mind
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
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
            >
              Never mind
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
