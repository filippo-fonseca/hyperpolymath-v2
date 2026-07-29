"use client";

import { moveProjectToArea, updateProject } from "@/app/actions/projects";
import { PageScaffold } from "@/components/ui/PageScaffold";
import { Button } from "@/components/ui/button";
import { tableKey } from "@/lib/realtime/query-keys";
import { cn } from "@/lib/utils";
import { parseBanner } from "@/lib/utils/banner";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Settings2 } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AreaPicker } from "./AreaPicker";
import { BannerPicker } from "./BannerPicker";
import { DynamicIcon } from "./DynamicIcon";
import { IconPicker } from "./IconPicker";
import type { ProjectOptimisticDispatch } from "./ProjectDetailClient";
import { ProjectEditClassDialog } from "./ProjectEditClassDialog";
import { ProjectSettingsDialog } from "./ProjectSettingsDialog";

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  bannerUrl: string | null;
  areaId: string;
  startDate: string | null;
  endDate: string | null;
  archivedAt: string | Date | null;
  isClass: boolean;
  courseCode: string | null;
  courseTitle: string | null;
  instructor: string | null;
  grade: string | null;
  credits: number | null;
  distributionals: string[] | null;
  semesterTerm: "fall" | "spring" | "summer" | null;
  semesterYear: number | null;
}

interface Props {
  project: ProjectData;
  graduationYear: number | null;
  addOptimisticProject: ProjectOptimisticDispatch;
  /** Owning user — the collection query key every project mutation settles on. */
  userId: string;
  /** Parent area — rendered in the breadcrumb eyebrow and the meta row's
      move-to-area control. Resolved by the parent from the project's live
      areaId, so it follows a move. */
  area: { id: string; name: string; emoji: string | null } | null;
  /** All active areas — for the "move to area" control. */
  allAreas: { id: string; name: string; emoji?: string | null }[];
  /** Fired by the header's one primary action; the parent routes it to the
      tasks section, which opens the create draft panel. */
  onNewTask: () => void;
  /** Page sections. Rendered inside the PageScaffold so the header and the
      body share one measure and left edges line up across routes. */
  children?: ReactNode;
}

function formatTerm(term: string): string {
  return term.charAt(0).toUpperCase() + term.slice(1);
}

/**
 * Class metadata, one meta-row item per part:
 *   PHIL 277 · Prof. Lloyd · Fall 2026 · A-
 */
function buildClassMetaParts(project: ProjectData): string[] {
  const parts: string[] = [];
  if (project.courseCode) parts.push(project.courseCode);
  if (project.instructor) {
    // Do not double the honorific when the stored value already carries one.
    parts.push(/^(prof|dr|mr|ms|mrs)\.?\s/i.test(project.instructor)
      ? project.instructor
      : `Prof. ${project.instructor}`);
  }
  if (project.semesterTerm && project.semesterYear) {
    parts.push(`${formatTerm(project.semesterTerm)} ${project.semesterYear}`);
  } else if (project.semesterTerm) {
    parts.push(formatTerm(project.semesterTerm));
  } else if (project.semesterYear) {
    parts.push(String(project.semesterYear));
  }
  if (project.grade) parts.push(project.grade);
  return parts;
}

/**
 * Project header on the SDC-1 register (jul-28 sesh, U9).
 *
 * The banner stays flush and edge to edge above the scaffold with no added
 * chrome; everything below it is a PageScaffold, so the H1 left edge matches
 * every other route. Breadcrumbs live in the eyebrow, the description renders
 * as the subtitle, class metadata is a plain-text meta row, and the header
 * carries exactly one primary button (New task).
 *
 * Notion-style inline edits are preserved: the title is click-to-edit (the
 * edit underline is --edge-strong, not amber), the icon is its own picker
 * trigger, and the area is a quiet meta-row control that moves the project.
 *
 * Phase 3 wiring (preserved):
 *  - All optimistic edits dispatch through addOptimisticProject so the same
 *    useOptimistic state ProjectDetailClient owns updates instantly.
 *  - Realtime echo invalidates ['projects', userId] and refetches canonical.
 */
export function ProjectHeader({
  project,
  graduationYear,
  addOptimisticProject,
  userId,
  area,
  allAreas,
  onNewTask,
  children,
}: Props) {
  const [, startTransition] = useTransition();
  const queryClient = useQueryClient();

  // Moving the project is the same optimistic shape as every other header
  // edit: patch `areaId` through the shared dispatcher, and the parent
  // re-resolves the breadcrumb off the live row. Settling then costs one
  // refetch of the projects collection instead of a router.refresh, which
  // re-ran the entire route tree, layout queries included. Awaiting the
  // invalidation inside the transition keeps the optimistic value on screen
  // until canonical data has landed, so there is no flicker.
  function handleAreaChange(newAreaId: string) {
    if (newAreaId === project.areaId) return;
    if (!allAreas.some((a) => a.id === newAreaId)) return;
    addOptimisticProject({
      type: "update",
      id: project.id,
      patch: { areaId: newAreaId },
    });
    startTransition(async () => {
      const result = await moveProjectToArea({ projectId: project.id, newAreaId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: tableKey("projects", userId) });
    });
  }

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [editClassOpen, setEditClassOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function handleBannerChange(newBanner: string | null) {
    addOptimisticProject({
      type: "update",
      id: project.id,
      patch: { bannerUrl: newBanner },
    });
    startTransition(async () => {
      const result = await updateProject({
        id: project.id,
        bannerUrl: newBanner,
      });
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  function handleNameClick() {
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  }

  // Notion-style click-to-edit for the project icon. Mirrors handleNameCommit's
  // optimistic pattern: dispatch through addOptimisticProject so the icon swaps
  // instantly, then persist via updateProject (which already accepts `icon`);
  // the Realtime echo reconciles to canonical.
  function handleIconCommit(newIcon: string | null) {
    if (newIcon === project.icon) return;
    addOptimisticProject({
      type: "update",
      id: project.id,
      patch: { icon: newIcon },
    });
    startTransition(async () => {
      const result = await updateProject({ id: project.id, icon: newIcon });
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  function handleNameCommit() {
    const trimmed = nameValue.trim();
    setIsEditingName(false);
    if (!trimmed || trimmed === project.name) {
      setNameValue(project.name);
      return;
    }
    addOptimisticProject({
      type: "update",
      id: project.id,
      patch: { name: trimmed },
    });
    startTransition(async () => {
      const result = await updateProject({ id: project.id, name: trimmed });
      if (!result.success) {
        toast.error(result.error);
        setNameValue(project.name);
        return;
      }
    });
  }

  const classMetaParts = project.isClass ? buildClassMetaParts(project) : [];

  // Eyebrow — breadcrumb trail. Plain links, no chips, faint separators.
  const eyebrow = (
    <span className="flex flex-wrap items-center gap-2">
      <Link
        href="/areas"
        className="transition-colors duration-[160ms] ease-out hover:text-[var(--ink-muted)]"
      >
        Areas
      </Link>
      {area ? (
        <>
          <span aria-hidden>/</span>
          <Link
            href={`/areas/${area.id}`}
            className="transition-colors duration-[160ms] ease-out hover:text-[var(--ink-muted)]"
          >
            {area.emoji ? <span aria-hidden>{area.emoji} </span> : null}
            {area.name}
          </Link>
        </>
      ) : null}
      <span aria-hidden>/</span>
      <span className="text-[var(--ink-muted)]">{project.name}</span>
    </span>
  );

  // Title — icon picker trigger + click-to-edit name, inside the scaffold H1
  // so the measured left edge is the scaffold content edge.
  const title = (
    <span className="flex min-w-0 items-center gap-3">
      {project.icon ? (
        <IconPicker
          value={project.icon}
          onChange={handleIconCommit}
          renderTrigger={
            <button
              type="button"
              aria-label="Change project icon"
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                "cursor-pointer-always text-[var(--ink)]",
                "transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)]"
              )}
            >
              <DynamicIcon name={project.icon} size={28} strokeWidth={1.5} />
            </button>
          }
        />
      ) : null}
      {isEditingName ? (
        <input
          ref={nameInputRef}
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={handleNameCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleNameCommit();
            if (e.key === "Escape") {
              setIsEditingName(false);
              setNameValue(project.name);
            }
          }}
          className={cn(
            "w-full min-w-0 flex-1 bg-transparent outline-none",
            "text-display font-semibold text-[var(--ink)]",
            "border-b border-[var(--edge-strong)]"
          )}
          autoFocus
        />
      ) : (
        // biome-ignore lint/a11y/useSemanticElements: a <button> cannot flow inside the H1's text register; role+tabIndex keep it keyboard-editable
        <span
          role="button"
          tabIndex={0}
          aria-label={`Rename project: ${project.name}`}
          onClick={handleNameClick}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleNameClick();
          }}
          className="min-w-0 cursor-text transition-opacity duration-[160ms] ease-out hover:opacity-80"
        >
          {project.name}
        </span>
      )}
    </span>
  );

  // Meta row — the move-to-area control as quiet text, then class metadata as
  // plain-text items. The MetaRow inserts the faint · separators.
  const metaItems: ReactNode[] = [
    <AreaPicker
      key="area"
      currentAreaId={project.areaId}
      areas={allAreas}
      onSelect={handleAreaChange}
      renderTrigger={
        <button
          type="button"
          aria-label={
            area
              ? `Area: ${area.name}. Click to move this project to another area.`
              : "Move this project to another area."
          }
          className={cn(
            "inline-flex items-center gap-1 rounded-sm cursor-pointer-always",
            "text-[var(--ink-muted)] transition-colors duration-[160ms] ease-out hover:text-[var(--ink)]"
          )}
        >
          {area?.emoji ? <span aria-hidden>{area.emoji}</span> : null}
          <span>{area?.name ?? "No area"}</span>
          <ChevronDown size={12} strokeWidth={2} className="text-[var(--ink-faint)]" aria-hidden />
        </button>
      }
    />,
    ...classMetaParts,
  ];

  return (
    <>
      {/* Banner — jul-29 craft restyle: an inset rounded cover aligned with
          the scaffold's measure (Craft/Notion cover grammar) instead of an
          edge-to-edge strip. Rendered only when one is set; a banner-less
          project starts at the scaffold and gains an "Add banner" ghost
          action in the header. */}
      {project.bannerUrl ? (
        <div className="mx-auto w-full max-w-[1120px] px-8 pt-6">
          <div
            className="group/banner-area relative w-full overflow-hidden rounded-2xl border border-[var(--edge)] shadow-[var(--shadow-card)]"
            style={{ height: "140px", background: parseBanner(project.bannerUrl) }}
          >
          <div
            className={cn(
              "absolute top-3 right-3",
              "opacity-0 transition-opacity duration-[160ms] ease-out",
              "group-hover/banner-area:opacity-100 focus-within:opacity-100"
            )}
          >
            <BannerPicker value={project.bannerUrl} onChange={handleBannerChange} />
          </div>
          </div>
        </div>
      ) : null}

      <PageScaffold
        eyebrow={eyebrow}
        title={title}
        subtitle={project.description ?? undefined}
        meta={<PageScaffold.MetaRow>{metaItems}</PageScaffold.MetaRow>}
        actions={
          <>
            {!project.icon ? (
              <IconPicker
                value={project.icon}
                onChange={handleIconCommit}
                renderTrigger={
                  <Button variant="ghost" size="sm" className="rounded-lg">
                    Add icon
                  </Button>
                }
              />
            ) : null}
            {!project.bannerUrl ? (
              <BannerPicker
                value={project.bannerUrl}
                onChange={handleBannerChange}
                renderTrigger={
                  <Button variant="ghost" size="sm" className="rounded-lg">
                    Add banner
                  </Button>
                }
              />
            ) : null}
            {project.isClass ? (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg"
                onClick={() => setEditClassOpen(true)}
              >
                Edit class
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-lg"
              aria-label="Project settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={15} strokeWidth={1.5} />
            </Button>
            {/* The header's ONE primary button. */}
            <Button size="sm" className="rounded-lg" onClick={onNewTask}>
              New task
            </Button>
          </>
        }
      >
        {children}
      </PageScaffold>

      <ProjectEditClassDialog
        open={editClassOpen}
        onOpenChange={setEditClassOpen}
        project={project}
        graduationYear={graduationYear}
        addOptimisticProject={addOptimisticProject}
      />

      <ProjectSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        project={{
          id: project.id,
          name: project.name,
          description: project.description,
          areaId: project.areaId,
          startDate: project.startDate,
          endDate: project.endDate,
          archivedAt: project.archivedAt,
        }}
        allAreas={allAreas}
        addOptimisticProject={addOptimisticProject}
        userId={userId}
      />
    </>
  );
}
