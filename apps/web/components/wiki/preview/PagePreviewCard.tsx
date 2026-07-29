import { ProjectPill } from "@/components/pages/ProjectPill";
import { type PreviewModel, extractPreviewModel } from "@/lib/pages/preview";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { ReactNode } from "react";
import { PagePreviewThumb } from "./PagePreviewThumb";

export interface PagePreviewCardProject {
  id: string;
  name: string;
}

export interface PagePreviewCardPage {
  title: string | null;
  content: string | null;
  contentJson: unknown;
  emoji?: string | null;
  coverImageUrl?: string | null;
  updatedAt: Date | string;
  projects?: PagePreviewCardProject[];
}

export interface PagePreviewCardProps {
  page: PagePreviewCardPage;
  model?: PreviewModel;
  icon?: ReactNode;
  selected?: boolean;
  dropTarget?: boolean;
  className?: string;
}

export function PagePreviewCard({
  page,
  model,
  icon,
  selected = false,
  dropTarget = false,
  className,
}: PagePreviewCardProps) {
  const preview = model ?? extractPreviewModel(page.contentJson, page.content);
  const projects = page.projects ?? [];
  const title = page.title?.trim() || "Untitled page";

  return (
    <article
      aria-selected={selected}
      className={cn(
        "group flex h-full min-h-[236px] flex-col overflow-hidden rounded-xl border border-[var(--sd-line,var(--edge))] bg-[var(--sd-box,var(--surface-raised))] text-left outline-none transition-[background-color,border-color] duration-[160ms] ease-out hover:border-[var(--edge-strong)]",
        selected ? "bg-[var(--sd-selected-item)]" : undefined,
        dropTarget ? "border-dashed border-[var(--edge-strong)] bg-[var(--sd-selected-item)]" : undefined,
        className
      )}
    >
      <PagePreviewThumb
        page={page}
        model={preview}
        size="card"
        className="rounded-none border-0 border-b"
      />

      <div className="flex min-h-[92px] flex-1 flex-col gap-2 border-t border-[var(--sd-line,var(--edge))] px-3 py-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="grid size-7 flex-shrink-0 place-items-center rounded-[8px] bg-[var(--hover)] text-subtitle leading-none text-[var(--ink-muted)]">
            {icon ?? page.emoji ?? <FallbackPageIcon />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-meta font-medium leading-snug text-[var(--ink)]">
              {title}
            </h3>
            <p className="mt-1 truncate font-mono text-micro text-[var(--ink-faint)]">
              {formatUpdatedAt(page.updatedAt)}
            </p>
          </div>
        </div>

        {projects.length > 0 ? (
          <div className="mt-auto flex min-h-5 flex-wrap items-center gap-1 overflow-hidden">
            {projects.slice(0, 3).map((project) => (
              <ProjectPill key={project.id} name={project.name} isInherited={false} />
            ))}
            {projects.length > 3 ? (
              <span className="rounded px-1.5 py-0.5 font-mono text-micro text-[var(--ink-muted)]">
                +{projects.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function formatUpdatedAt(value: Date | string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated recently";
  return formatDistanceToNow(date, { addSuffix: true });
}

function FallbackPageIcon() {
  return (
    <svg viewBox="0 0 24 28" aria-hidden="true" className="h-4 w-3.5" fill="none">
      <path d="M4 1.75h10.5L20 7.25v19H4V1.75Z" fill="currentColor" opacity="0.1" />
      <path d="M4 1.75h10.5L20 7.25v19H4V1.75Z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M14.5 1.75v5.5H20" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M7.5 13h9M7.5 17h7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M4.75 25.5h14.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
