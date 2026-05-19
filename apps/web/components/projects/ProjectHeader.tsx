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

function formatTerm(term: string): string {
  return term.charAt(0).toUpperCase() + term.slice(1);
}

/**
 * Class metadata inline line (UI-SPEC §5j metadata strip):
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
 * Phase 06.1 Plan 04 (UI-SPEC §5j) — Notion-pure project header.
 *
 * Visual register:
 *  - bg --canvas, NO card chrome anywhere on the page
 *  - Banner sits flush at the top of the content column (no rounded corners,
 *    no border — pure edge-to-edge image)
 *  - Project icon (Lucide via DynamicIcon at stroke 1.5) inline with H1
 *  - H1 serif 36px 600 in --ink
 *  - Class metadata strip in font-mono text-xs --ink-muted (only mono usage
 *    on this page — UI-SPEC §5j)
 *  - Inline name edit underline on edit becomes --ink-amber
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
}: Props) {
  const [, startTransition] = useTransition();

  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [editClassOpen, setEditClassOpen] = useState(false);

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

  const classMeta = project.isClass ? buildClassMeta(project) : "";

  return (
    <>
      {/* Banner — flush, edge-to-edge, no rounded corners (UI-SPEC §5j) */}
      <div
        className="group/banner-area relative w-full"
        style={{ height: "120px", background: parseBanner(project.bannerUrl) }}
      >
        <div
          className={cn(
            "absolute top-3 right-3",
            "opacity-0 group-hover/banner-area:opacity-100 focus-within:opacity-100 transition-opacity",
          )}
        >
          <BannerPicker value={project.bannerUrl} onChange={handleBannerChange} />
        </div>
      </div>

      {/* Header row: icon + name + class meta — serif throughout (UI-SPEC §5j) */}
      <div className="px-8 pt-8 pb-4 flex flex-col gap-2">
        <div className="flex items-start gap-3">
          {/* Icon — Lucide at stroke 1.5 per UI-SPEC §8a, inline with title */}
          <div className="mt-1 shrink-0">
            <DynamicIcon
              name={project.icon}
              size={32}
              strokeWidth={1.5}
              className="text-[var(--ink)]"
            />
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-0">
            {/* H1 serif 36px 600 per UI-SPEC §5j */}
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
                  "font-serif text-4xl font-semibold leading-tight",
                  "bg-transparent border-b border-[var(--ink-amber)] outline-none",
                  "text-[var(--ink)] w-full",
                )}
                autoFocus
              />
            ) : (
              <h1
                onClick={handleNameClick}
                className={cn(
                  "font-serif text-4xl font-semibold leading-tight",
                  "text-[var(--ink)] cursor-text hover:opacity-80 transition-opacity duration-150 ease-out",
                )}
              >
                {project.name}
              </h1>
            )}

            {/* Class metadata strip — mono only, --ink-muted (UI-SPEC §5j) */}
            {project.isClass && classMeta && (
              <p className="font-mono text-xs text-[var(--ink-muted)] leading-snug tracking-[0.02em]">
                {classMeta}
              </p>
            )}

            {/* "Edit class" affordance — ghost-tier button surface */}
            {project.isClass && (
              <button
                type="button"
                onClick={() => setEditClassOpen(true)}
                className={cn(
                  "self-start mt-1 px-2 py-0.5 rounded-sm font-mono text-[11px] uppercase tracking-[0.08em] cursor-pointer-always",
                  "text-[var(--ink-muted)] hover:text-[var(--ink)]",
                  "border border-transparent hover:border-[var(--edge)]",
                  "transition-colors duration-150 ease-out",
                  "focus-visible:outline-none",
                )}
              >
                Edit class
              </button>
            )}
          </div>
        </div>
      </div>

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
