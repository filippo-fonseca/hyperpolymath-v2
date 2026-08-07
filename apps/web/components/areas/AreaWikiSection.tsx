"use client";

import { getFolderProjectsForCurrentUser, getFoldersForCurrentUser } from "@/app/actions/folders";
import { getPagesForCurrentUser } from "@/app/actions/pages";
import { EmptyState } from "@/components/ui/EmptyState";
import { FolderIcon } from "@/components/ui/icons/FolderIcon";
import { PagePreviewCard } from "@/components/wiki/preview/PagePreviewCard";
import { type TreeFolder, buildPagesTree } from "@/lib/pages/tree";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { coercePaletteToken, paletteClass } from "@/lib/ui/palette";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

/**
 * The area's wiki: every folder and page reachable through the area's
 * projects, in one place.
 *
 * A project page already shows its own slice of the wiki, but an area — the
 * tier that actually answers "what am I working on here" — showed tasks and
 * captures and then stopped, so the writing attached to the area's projects
 * was only findable one project at a time.
 *
 * Read-only on purpose. Creating and reorganizing belongs to the Explorer and
 * to the project pages, which own the folder-project link model; duplicating
 * those mutations here would mean two places to keep correct for no new
 * capability. Folders open the Explorer scoped to themselves, pages open
 * directly.
 */
export function AreaWikiSection({
  userId,
  areaProjectIds,
}: {
  userId: string;
  /** Every project under this area, archived ones included. */
  areaProjectIds: string[];
}) {
  const router = useRouter();

  useTableSubscription("pages", userId);
  useTableSubscription("page_folders", userId);

  const { data: pages = [] } = useQuery({
    queryKey: tableKey("pages", userId),
    queryFn: getPagesForCurrentUser,
  });
  const { data: folders = [] } = useQuery({
    queryKey: tableKey("page_folders", userId),
    queryFn: getFoldersForCurrentUser,
  });
  const { data: folderLinks = [] } = useQuery({
    queryKey: [...tableKey("page_folders", userId), "project-links"],
    queryFn: getFolderProjectsForCurrentUser,
  });

  const projectSet = useMemo(() => new Set(areaProjectIds), [areaProjectIds]);

  // A folder counts when its EFFECTIVE project set (its own links plus every
  // ancestor's) touches the area — the same inheritance rule the Explorer and
  // the project page use, so a subfolder under a linked parent is not lost.
  // buildPagesTree is what computes that set, so this reads it rather than
  // re-deriving inheritance and risking a second, subtly different answer.
  const areaFolders = useMemo(() => {
    if (projectSet.size === 0) return [];
    const tree = buildPagesTree(folders, folderLinks, pages);
    const colorById = new Map(folders.map((f) => [f.id, f.color ?? null]));
    const out: { id: string; name: string; color: string | null }[] = [];

    const walk = (nodes: TreeFolder[]) => {
      for (const node of nodes) {
        if (node.effectiveProjectIds.some((id) => projectSet.has(id))) {
          out.push({ id: node.id, name: node.name, color: colorById.get(node.id) ?? null });
        }
        walk(node.subfolders);
      }
    };
    walk(tree.roots);
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, folderLinks, pages, projectSet]);

  // Pages linked straight to one of the area's projects. Daily pages are
  // excluded: they belong to the journal rail, not to an area's library.
  const areaPages = useMemo(() => {
    if (projectSet.size === 0) return [];
    return pages
      .filter((p) => !p.dailyDate && p.projects.some((proj) => projectSet.has(proj.id)))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [pages, projectSet]);

  if (areaFolders.length === 0 && areaPages.length === 0) {
    return (
      <EmptyState
        size="inline"
        title="Nothing in the wiki for this area yet."
        description="Pages and folders linked to this area's projects show up here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {areaFolders.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {areaFolders.map((folder) => {
            const chosen = coercePaletteToken(folder.color);
            return (
              <Link
                key={folder.id}
                href={`/wiki?folder=${folder.id}`}
                className="craft-card craft-card-hover flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2.5"
              >
                <span
                  className={cn(
                    "inline-flex shrink-0",
                    chosen ? `${paletteClass(chosen)} text-[var(--tint-edge)]` : undefined
                  )}
                >
                  <FolderIcon size={20} variant="closed" />
                </span>
                <span className="min-w-0 flex-1 truncate text-meta text-[var(--ink)]">
                  {folder.name}
                </span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {areaPages.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {areaPages.slice(0, 12).map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => router.push(`/wiki/${page.id}`)}
              className="cursor-pointer-always text-left"
            >
              <PagePreviewCard page={page} />
            </button>
          ))}
        </div>
      ) : null}

      {areaPages.length > 12 ? (
        <p className="text-micro text-[var(--ink-faint)]">
          Showing the 12 most recently edited of {areaPages.length} pages.
        </p>
      ) : null}
    </div>
  );
}
