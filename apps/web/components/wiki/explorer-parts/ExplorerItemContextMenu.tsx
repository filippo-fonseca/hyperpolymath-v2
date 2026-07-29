"use client";

import {
  ExplorerContextMenu,
  ExplorerContextMenuContent,
  ExplorerContextMenuItem,
  ExplorerContextMenuSeparator,
  ExplorerContextMenuTrigger,
} from "@/components/ui/explorer";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
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
}: ExplorerItemContextMenuProps) {
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
