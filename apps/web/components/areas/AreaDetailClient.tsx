"use client";

import { deleteArea, getAreasForCurrentUser, updateArea } from "@/app/actions/areas";
import { type AreaCaptureRow, AreaCapturesSection } from "@/components/areas/AreaCapturesSection";
import type { AreaDetailArea, AreaProject } from "@/components/areas/AreaProjectList";
import { AreaProjectList } from "@/components/areas/AreaProjectList";
import {
  type AreaTaskRow,
  AreaTasksRollup,
  useAreaTasks,
} from "@/components/areas/AreaTasksRollup";
import { AreaWikiSection } from "@/components/areas/AreaWikiSection";
import { ProjectCreateDialog } from "@/components/projects/ProjectCreateDialog";
import { Spinner } from "@/components/shared/Spinner";
import { usePendingAction } from "@/components/shared/use-pending-action";
import { PageScaffold } from "@/components/ui/PageScaffold";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface Props {
  userId: string;
  area: AreaDetailArea;
  projects: AreaProject[];
  tasks: AreaTaskRow[];
  captures: AreaCaptureRow[];
  allAreas: { id: string; name: string }[];
  graduationYear: number | null;
}

/**
 * /areas/[areaId] client composition: PageScaffold header plus the area's
 * surfaces as sections.
 *
 * The header binds to the canonical ['areas', userId] collection (the same
 * cache the sidebar hydrates and the Realtime channel invalidates) via
 * `select`, mirroring ProjectDetailClient. A rename from the sidebar, from
 * Kiwi, or from the edit dialog here settles into that one cache entry and
 * this H1 re-renders live, without a navigation.
 */
export function AreaDetailClient({
  userId,
  area,
  projects,
  tasks,
  captures,
  allAreas,
  graduationYear,
}: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Realtime invalidation source. The sidebar also subscribes; the channel
  // layer dedupes, so this is just this page declaring its own dependency.
  useTableSubscription("areas", userId);

  // The sidebar seeds ['areas', userId] on every load, so this resolves from
  // cache instantly; the queryFn only fires on a cold cache. `select` re-runs
  // on every invalidation echo, which is what keeps the H1 live.
  const { data: liveArea } = useQuery({
    queryKey: tableKey("areas", userId),
    queryFn: getAreasForCurrentUser,
    select: (rows) => rows.find((a) => a.id === area.id),
  });

  // Optimistic overlay for the edit dialog: shown until the Realtime echo
  // lands in the collection cache, then cleared so the cache is authoritative.
  const [override, setOverride] = useState<{ name: string; emoji: string | null } | null>(null);
  const liveName = liveArea ? liveArea.name : area.name;
  const liveEmoji = liveArea ? liveArea.emoji : area.emoji;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the overlay clears when the live row changes
  useEffect(() => {
    setOverride(null);
  }, [liveName, liveEmoji]);

  const displayName = override ? override.name : liveName;
  const displayEmoji = override ? override.emoji : liveEmoji;

  // Dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [name, setName] = useState(area.name);
  const [emoji, setEmoji] = useState(area.emoji ?? "");
  const { run, pending: isSaving } = usePendingAction();
  const { run: runDelete, pending: isDeleting } = usePendingAction();

  const activeCount = projects.filter((p) => !p.archivedAt).length;
  const archivedCount = projects.length - activeCount;

  // Live open-task count for the meta row. Same query key and select the
  // rollup section uses, so TanStack dedupes the fetch and both stay in step.
  const areaProjectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const liveTasks = useAreaTasks(userId, areaProjectIds, tasks);
  const openTaskCount = liveTasks.filter((t) => t.status !== "lesno").length;

  async function handleSaveEdit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await run(() => updateArea({ id: area.id, name: trimmed, emoji: emoji.trim() || null }), {
      success: "Area updated.",
      onSuccess: () => {
        setEditOpen(false);
        setOverride({ name: trimmed, emoji: emoji.trim() || null });
        // The Realtime echo also lands here eventually, but invalidating
        // directly keeps the sidebar tree in step even if the channel drops.
        queryClient.invalidateQueries({ queryKey: tableKey("areas", userId) });
      },
    });
  }

  async function handleDeleteArea() {
    await runDelete(() => deleteArea(area.id), {
      success: "Area deleted.",
      onSuccess: () => {
        setDeleteOpen(false);
        queryClient.invalidateQueries({ queryKey: tableKey("areas", userId) });
        router.push("/areas");
        router.refresh();
      },
    });
  }

  function openEdit() {
    setName(displayName);
    setEmoji(displayEmoji ?? "");
    setEditOpen(true);
  }

  return (
    <PageScaffold
      eyebrow={
        <Link
          href="/areas"
          className="transition-colors duration-[160ms] ease-out hover:text-[var(--ink-muted)]"
        >
          Areas
        </Link>
      }
      // The emoji rides inside the title node rather than the scaffold's icon
      // slot: the icon slot sits beside the h1 and would shift its left edge
      // 44px right, and the design contract asserts equal H1 left edges
      // across routes. Same optics, honest geometry.
      title={
        displayEmoji ? (
          <span className="flex items-center gap-3">
            <span className="text-2xl leading-none" aria-hidden="true">
              {displayEmoji}
            </span>
            <span className="min-w-0 truncate">{displayName}</span>
          </span>
        ) : (
          displayName
        )
      }
      meta={
        <PageScaffold.MetaRow>
          {[
            <span key="active">
              {activeCount} active project{activeCount === 1 ? "" : "s"}
            </span>,
            archivedCount > 0 ? <span key="archived">{archivedCount} archived</span> : null,
            <span key="tasks">
              {openTaskCount} open task{openTaskCount === 1 ? "" : "s"}
            </span>,
          ]}
        </PageScaffold.MetaRow>
      }
      actions={
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-lg"
                aria-label="Area actions"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="rounded-lg" onSelect={openEdit}>
                <Pencil className="size-3.5" />
                Edit area
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="rounded-lg"
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-3.5" />
                Delete area
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="rounded-lg" onClick={() => setNewProjectOpen(true)}>
            <Plus className="size-4" />
            New project
          </Button>
        </>
      }
    >
      <PageScaffold.Section title="Projects">
        <AreaProjectList
          areaId={area.id}
          area={area}
          userId={userId}
          projects={projects}
          allAreas={allAreas}
          onNewProject={() => setNewProjectOpen(true)}
        />
      </PageScaffold.Section>

      <PageScaffold.Section
        title="Tasks"
        divided
        action={
          <Button asChild variant="ghost" size="sm" className="rounded-lg">
            <Link href="/tasks">All tasks</Link>
          </Button>
        }
      >
        <AreaTasksRollup userId={userId} areaProjectIds={areaProjectIds} initialTasks={tasks} />
      </PageScaffold.Section>

      <PageScaffold.Section
        title="Wiki"
        divided
        action={
          <Button asChild variant="ghost" size="sm" className="rounded-lg">
            <Link href="/wiki">Open wiki</Link>
          </Button>
        }
      >
        <AreaWikiSection userId={userId} areaProjectIds={areaProjectIds} />
      </PageScaffold.Section>

      <PageScaffold.Section
        title="Captures"
        divided
        action={
          <Button asChild variant="ghost" size="sm" className="rounded-lg">
            <Link href="/captures">All captures</Link>
          </Button>
        }
      >
        <AreaCapturesSection
          userId={userId}
          areaProjectIds={areaProjectIds}
          initialCaptures={captures}
        />
      </PageScaffold.Section>

      {/* Edit area dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Edit area</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="detail-edit-name">Name</Label>
              <Input
                id="detail-edit-name"
                className="rounded-lg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit();
                  if (e.key === "Escape") setEditOpen(false);
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="detail-edit-emoji">Emoji (optional)</Label>
              <Input
                id="detail-edit-emoji"
                className="rounded-lg"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={8}
                placeholder="e.g. 🎓"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={() => setEditOpen(false)}
              disabled={isSaving}
            >
              Never mind
            </Button>
            <Button
              className="rounded-lg"
              onClick={handleSaveEdit}
              disabled={isSaving || !name.trim()}
            >
              {isSaving ? (
                <>
                  <Spinner size={14} label="Saving area" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete area dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="rounded-xl">
          <DialogHeader>
            <DialogTitle>Delete this area?</DialogTitle>
            <DialogDescription>
              This permanently deletes <strong>{displayName}</strong>. Any projects under it will be
              moved to the <strong>No Area</strong> bucket. Tasks and captures stay intact.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-lg"
              onClick={() => setDeleteOpen(false)}
              disabled={isDeleting}
            >
              Never mind
            </Button>
            <Button
              variant="destructive"
              className="rounded-lg"
              onClick={handleDeleteArea}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Spinner size={14} label="Deleting area" />
                  Deleting…
                </>
              ) : (
                "Delete area"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New project dialog */}
      <ProjectCreateDialog
        open={newProjectOpen}
        onOpenChange={setNewProjectOpen}
        defaultAreaId={area.id}
        areas={allAreas}
        graduationYear={graduationYear}
      />
    </PageScaffold>
  );
}
