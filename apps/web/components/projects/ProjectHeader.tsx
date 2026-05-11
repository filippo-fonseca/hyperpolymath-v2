"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { parseBanner } from "@/lib/utils/banner";
import { DynamicIcon } from "./DynamicIcon";
import { BannerPicker } from "./BannerPicker";
import { ProjectEditClassDialog } from "./ProjectEditClassDialog";
import { updateProject } from "@/app/actions/projects";
import { cn } from "@/lib/utils";

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
 * Only fields with values are rendered; separator is " · ".
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
 * ProjectHeader — per UI-SPEC §Project Detail Page:
 * - Banner: 120px tall, full-width, style.background = parseBanner(bannerUrl)
 * - "Change cover" button overlay top-right on hover
 * - Icon (32px) + project name (EB Garamond 28px/600) editable inline on click
 * - Class metadata line (EB Garamond 16px italic) — only fields with values, separator " · "
 * - "Edit class" button (ghost, small) when isClass=true → opens ProjectEditClassDialog
 */
export function ProjectHeader({ project, graduationYear }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Banner state
  const [bannerUrl, setBannerUrl] = useState(project.bannerUrl);

  // Inline name edit
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(project.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Edit class dialog
  const [editClassOpen, setEditClassOpen] = useState(false);

  // Live project state for metadata display (updated after Edit class save)
  const [projectData, setProjectData] = useState(project);

  function handleBannerChange(newBanner: string | null) {
    setBannerUrl(newBanner);
    startTransition(async () => {
      const result = await updateProject({
        id: project.id,
        bannerUrl: newBanner,
      });
      if (!result.success) {
        toast.error(result.error);
        setBannerUrl(project.bannerUrl); // revert on error
        return;
      }
      router.refresh();
    });
  }

  function handleNameClick() {
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  }

  function handleNameCommit() {
    const trimmed = nameValue.trim();
    setIsEditingName(false);
    if (!trimmed || trimmed === projectData.name) {
      setNameValue(projectData.name);
      return;
    }
    setProjectData((prev) => ({ ...prev, name: trimmed }));
    startTransition(async () => {
      const result = await updateProject({ id: project.id, name: trimmed });
      if (!result.success) {
        toast.error(result.error);
        setNameValue(projectData.name);
        setProjectData((prev) => ({ ...prev, name: projectData.name }));
        return;
      }
      router.refresh();
    });
  }

  const classMeta = projectData.isClass ? buildClassMeta(projectData) : "";

  return (
    <>
      {/* Banner — 120px tall, full-width, "Change cover" button group on hover */}
      <div
        className="group/banner-area relative w-full"
        style={{ height: "120px", background: parseBanner(bannerUrl) }}
      >
        {/* "Change cover" — wraps BannerPicker popover trigger */}
        <div
          className={cn(
            "absolute top-3 right-3",
            "opacity-0 group-hover/banner-area:opacity-100 focus-within:opacity-100 transition-opacity",
          )}
        >
          <BannerPicker value={bannerUrl} onChange={handleBannerChange} />
        </div>
      </div>

      {/* Header row: icon + name + class meta */}
      <div className="px-8 pt-6 pb-4 flex flex-col gap-1">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="mt-1 shrink-0">
            <DynamicIcon name={projectData.icon} size={32} className="text-foreground" />
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
                    setNameValue(projectData.name);
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
                {projectData.name}
              </h1>
            )}

            {/* Class metadata inline line — EB Garamond 16px italic */}
            {projectData.isClass && classMeta && (
              <p className="font-serif text-base italic text-muted-foreground leading-snug">
                {classMeta}
              </p>
            )}

            {/* "Edit class" button — ghost, small, only when isClass */}
            {projectData.isClass && (
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

      {/* Edit class dialog */}
      <ProjectEditClassDialog
        open={editClassOpen}
        onOpenChange={(open) => {
          setEditClassOpen(open);
          if (!open) {
            // Re-fetch to reflect any changes (router.refresh() handled by the dialog)
            router.refresh();
          }
        }}
        project={projectData}
        graduationYear={graduationYear}
      />
    </>
  );
}
