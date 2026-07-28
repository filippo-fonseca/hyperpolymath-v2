"use client";

import { PagePreviewCard } from "@/components/wiki/preview/PagePreviewCard";
import type { PageWithProjects } from "@/lib/db/queries/pages";
import type { FolderRow } from "@/lib/pages/folder-projects";
import { cn } from "@/lib/utils";
import type { MouseEvent } from "react";

export interface ExplorerSearchHit {
  page: PageWithProjects;
  /** Folder ancestry chain (root -> parent) formatted for display. */
  location: string;
}

export interface ExplorerSearchResultsProps {
  hits: ExplorerSearchHit[];
  onOpen: (page: PageWithProjects) => void;
  onSelect?: (page: PageWithProjects, event: MouseEvent) => void;
  selectedId?: string | null;
}

/**
 * Flat, cross-wiki search results with folder-path captions. Rendered when the
 * top-bar search is non-empty — replaces the current-folder view rather than
 * filtering it in place.
 */
export function ExplorerSearchResults({
  hits,
  onOpen,
  onSelect,
  selectedId,
}: ExplorerSearchResultsProps) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
    >
      {hits.map((hit) => (
        <button
          key={hit.page.id}
          type="button"
          onClick={(event) => onSelect?.(hit.page, event)}
          onDoubleClick={() => onOpen(hit.page)}
          className={cn("group flex flex-col gap-1 rounded-lg outline-none")}
        >
          <PagePreviewCard
            page={hit.page}
            icon={hit.page.emoji ?? null}
            selected={selectedId === `page:${hit.page.id}`}
          />
          <span className="truncate px-1 font-sans text-micro text-[var(--sd-ink-dull)]">
            {hit.location || "Wiki"}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Given a page + folder list, format its location breadcrumb (root -> parent). */
export function formatPageLocation(page: PageWithProjects, folders: FolderRow[]): string {
  if (!page.folderId) return "Wiki";
  const byId = new Map(folders.map((f) => [f.id, f] as const));
  const chain: string[] = [];
  const seen = new Set<string>();
  let cur: string | null = page.folderId;
  while (cur && !seen.has(cur)) {
    const row = byId.get(cur);
    if (!row) break;
    seen.add(cur);
    chain.unshift(row.name);
    cur = row.parentId;
  }
  return chain.length > 0 ? `Wiki / ${chain.join(" / ")}` : "Wiki";
}
