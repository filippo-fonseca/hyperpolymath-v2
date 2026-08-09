"use client";

import { ColorSwatchRow } from "@/components/ui/ColorSwatchRow";
import {
  ExplorerContextMenu,
  ExplorerContextMenuCheckboxItem,
  ExplorerContextMenuContent,
  ExplorerContextMenuItem,
  ExplorerContextMenuLabel,
  ExplorerContextMenuSeparator,
  ExplorerContextMenuSub,
  ExplorerContextMenuSubContent,
  ExplorerContextMenuSubTrigger,
  ExplorerContextMenuTrigger,
} from "@/components/ui/explorer";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { type PaletteToken, coercePaletteToken } from "@/lib/ui/palette";
import type { ReactNode } from "react";

export interface ExplorerItemContextMenuProps {
  item: ExplorerItem;
  children: ReactNode;
  onOpen: (item: ExplorerItem) => void;
  onOpenInNewTab?: (item: ExplorerItem) => void;
  onRename: (item: ExplorerItem) => void;
  onExport?: (item: ExplorerItem) => void;
  onDelete: (item: ExplorerItem) => void;
  /** Star/unstar — pages only (issue #365). */
  onToggleStar?: (item: ExplorerItem) => void;
  /** Paint a folder. Folders only; omitted on pages. */
  onSetFolderColor?: (folderId: string, color: PaletteToken | null) => void;
  /** Every project the folder could be filed under. Folders only. */
  projects?: { id: string; name: string }[];
  /** The folder's OWN project links (not the ones it inherits from a parent). */
  ownProjectIds?: string[];
  /** The projects the folder gets from an ancestor: shown, but not editable here. */
  inheritedProjectIds?: string[];
  /** Replace the folder's own project links. */
  onSetFolderProjects?: (folderId: string, projectIds: string[]) => void;
}

/**
 * Right-click menu for a single grid tile or list row. Move-to submenu lives on
 * the top bar / drag interaction, not here — see PagesListClient's WikiPageMenu
 * for the deep folder tree UI when that becomes necessary.
 */
export function ExplorerItemContextMenu({
  item,
  children,
  onOpen,
  onOpenInNewTab,
  onRename,
  onExport,
  onDelete,
  onToggleStar,
  onSetFolderColor,
  projects,
  ownProjectIds,
  inheritedProjectIds,
  onSetFolderProjects,
}: ExplorerItemContextMenuProps) {
  const own = new Set(ownProjectIds ?? []);
  const inherited = new Set(inheritedProjectIds ?? []);
  return (
    <ExplorerContextMenu>
      <ExplorerContextMenuTrigger asChild>{children}</ExplorerContextMenuTrigger>
      <ExplorerContextMenuContent>
        <ExplorerContextMenuItem onSelect={() => onOpen(item)}>Open</ExplorerContextMenuItem>
        {onOpenInNewTab ? (
          <ExplorerContextMenuItem onSelect={() => onOpenInNewTab(item)}>
            Open in new tab
          </ExplorerContextMenuItem>
        ) : null}
        <ExplorerContextMenuSeparator />
        {item.kind === "page" && onToggleStar ? (
          <ExplorerContextMenuItem onSelect={() => onToggleStar(item)}>
            {item.page.pinned ? "Unstar" : "Star"}
          </ExplorerContextMenuItem>
        ) : null}
        <ExplorerContextMenuItem onSelect={() => onRename(item)}>Rename</ExplorerContextMenuItem>
        {item.kind === "folder" && onSetFolderProjects && projects ? (
          <ExplorerContextMenuSub>
            <ExplorerContextMenuSubTrigger>
              Projects
              <span className="ml-auto pl-4 text-micro text-[var(--ink-faint)]">
                {own.size + inherited.size > 0 ? own.size + inherited.size : "None"}
              </span>
            </ExplorerContextMenuSubTrigger>
            <ExplorerContextMenuSubContent>
              {projects.length === 0 ? (
                <ExplorerContextMenuLabel>No projects yet</ExplorerContextMenuLabel>
              ) : (
                projects.map((project) => {
                  // An inherited link belongs to an ancestor, so it can only be
                  // undone up there. Ticked and locked is the honest reading of
                  // "this folder is in that project, but not because of you".
                  const isInherited = inherited.has(project.id) && !own.has(project.id);
                  return (
                    <ExplorerContextMenuCheckboxItem
                      key={project.id}
                      checked={own.has(project.id) || isInherited}
                      disabled={isInherited}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={(checked) => {
                        const next = new Set(own);
                        if (checked) next.add(project.id);
                        else next.delete(project.id);
                        onSetFolderProjects(item.id, [...next]);
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      {isInherited ? (
                        <span className="shrink-0 text-micro text-[var(--ink-faint)]">
                          inherited
                        </span>
                      ) : null}
                    </ExplorerContextMenuCheckboxItem>
                  );
                })
              )}
              <ExplorerContextMenuSeparator />
              <ExplorerContextMenuLabel>
                Subfolders and pages inside follow along.
              </ExplorerContextMenuLabel>
            </ExplorerContextMenuSubContent>
          </ExplorerContextMenuSub>
        ) : null}
        {item.kind === "folder" && onSetFolderColor ? (
          <>
            <ExplorerContextMenuSeparator />
            {/* Inline rather than a submenu: colour is a glance-and-click
                decision, and one extra hover to reach eight dots is worse than
                the row of dots itself. */}
            <div className="px-2 py-1.5">
              <p className="pb-1.5 text-micro text-[var(--ink-faint)]">Colour</p>
              <ColorSwatchRow
                value={coercePaletteToken(item.folder.color)}
                onChange={(next) => onSetFolderColor(item.id, next)}
              />
            </div>
          </>
        ) : null}
        {onExport ? (
          <ExplorerContextMenuItem onSelect={() => onExport(item)}>Export</ExplorerContextMenuItem>
        ) : null}
        <ExplorerContextMenuSeparator />
        <ExplorerContextMenuItem variant="destructive" onSelect={() => onDelete(item)}>
          Delete
        </ExplorerContextMenuItem>
      </ExplorerContextMenuContent>
    </ExplorerContextMenu>
  );
}
