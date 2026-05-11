"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { parseBanner } from "@/lib/utils/banner";
import { DynamicIcon } from "./DynamicIcon";
import { BannerPicker } from "./BannerPicker";
import { ProjectEditClassDialog } from "./ProjectEditClassDialog";
import { updateProject } from "@/app/actions/projects";
import { cn } from "@/lib/utils";
import type { ProjectOptimisticDispatch } from "./ProjectDetailClient";

interface ProjectData {
  id: string;
  name: string;
  icon: string | null;
  bannerUrl: string | null;
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
}

/**
 * Capitalizes the first letter of a semester term for display.
 */
function formatTerm(term: string): string {
  return term.charAt(0).toUpperCase() + term.slice(1);
}

/**
 * Builds the class metadata inline line per D-16 / UI-SPEC §Project Detail Page:
 *   PHIL 277 · Prof. Lloyd · Fall 2026 · A-
 */
function buildClassMeta(project: ProjectData): string {
  const parts: string[] = [];
  if (project.courseCode) parts.push(project.courseCode);
  if (project.instructor) parts.push(`Prof. ${project.instructor}`);
  if (project.semesterTerm && project.semesterYear) {
    parts.push(`${formatTerm(project.semesterTerm)} ${project.semesterYear}`);
  } else if (project.semesterTerm) {
    parts.push(formatTerm(project.semesterTerm));
  } else if (project.semesterYear) {
    parts.push(String(project.semesterYear));
  }
  if (project.grade) parts.push(project.grade);
  return parts.join(" · ");
}

/**
 * ProjectHeader — Phase 3:
 * - Receives the canonical project shape from ProjectDetailClient's useQuery+select.
 * - All optimistic edits (icon, banner, name) dispatch through addOptimisticProject
 *   so the same useOptimistic state that ProjectDetailClient owns updates instantly.
 * - No router.refresh — Realtime echo invalidates `['projects', userId]` and
 *   the parent's `select` projection re-derives this project's data automatically.
 */
export function ProjectHeader({
  project,
  graduationYear,
  addOptimisticProject,
}: Props) {
  const [, startTransition] = useTransition();

  // Inline name edit
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Edit class dialog
  const [editClassOpen, setEditClassOpen] = useState(false);

  function handleBannerChange(newBanner: string | null) {
    // D-04: optimistic banner update
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
        // D-03: silent revert + toast.error
        toast.error(result.error);
      }
      // Realtime echo on ['projects', userId] settles the canonical state.
    });
  }

  function handleNameClick() {
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  }

  function handleNameCommit() {
    const trimmed = nameValue.trim();
    setIsEditingName(false);
    if (!trimmed || trimmed === project.name) {
      setNameValue(project.name);
      return;
    }
    // D-04: optimistic name update — header re-renders instantly via the
    // parent's useOptimistic state
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
      // Realtime echo: ['projects', userId] → refetch → select picks the
      // canonical name → header settles. Same key drives the sidebar so the
      // rename propagates everywhere automatically.
    });
  }

  const classMeta = project.isClass ? buildClassMeta(project) : "";

  return (
    <>
      {/* Banner — 120px tall, full-width, "Change cover" button group on hover */}
      <div
        className="group/banner-area relative w-full"
        style={{ height: "120px", background: parseBanner(project.bannerUrl) }}
      >
        {/* "Change cover" — wraps BannerPicker popover trigger */}
        <div
          className={cn(
            "absolute top-3 right-3",
            "opacity-0 group-hover/banner-area:opacity-100 focus-within:opacity-100 transition-opacity",
          )}
        >
          <BannerPicker value={project.bannerUrl} onChange={handleBannerChange} />
        </div>
      </div>

      {/* Header row: icon + name + class meta */}
      <div className="px-8 pt-6 pb-4 flex flex-col gap-1">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="mt-1 shrink-0">
            <DynamicIcon
              name={project.icon}
              size={32}
              className="text-foreground"
            />
          </div>

          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            {/* Project name — editable inline on click */}
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
                  "font-serif text-[28px] font-semibold leading-tight",
                  "bg-transparent border-b border-border outline-none",
                  "text-foreground w-full",
                )}
                autoFocus
              />
            ) : (
              <h1
                onClick={handleNameClick}
                className={cn(
                  "font-serif text-[28px] font-semibold leading-tight",
                  "text-foreground cursor-text hover:opacity-80 transition-opacity",
                )}
              >
                {project.name}
              </h1>
            )}

            {/* Class metadata inline line — EB Garamond 16px italic */}
            {project.isClass && classMeta && (
              <p className="font-serif text-base italic text-muted-foreground leading-snug">
                {classMeta}
              </p>
            )}

            {/* "Edit class" button — ghost, small, only when isClass */}
            {project.isClass && (
              <button
                type="button"
                onClick={() => setEditClassOpen(true)}
                className={cn(
                  "self-start mt-1 px-2 py-0.5 rounded text-[13px] font-sans",
                  "text-muted-foreground hover:text-foreground",
                  "border border-transparent hover:border-border transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-ring outline-none",
                )}
              >
                Edit class
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Edit class dialog — Realtime echo handles the post-save refresh
          (no manual router.refresh needed; the dialog dispatches optimistic
          updates through addOptimisticProject directly). */}
      <ProjectEditClassDialog
        open={editClassOpen}
        onOpenChange={setEditClassOpen}
        project={project}
        graduationYear={graduationYear}
        addOptimisticProject={addOptimisticProject}
      />
    </>
  );
}
