"use client";

import {
  ExplorerContextMenu,
  ExplorerContextMenuContent,
  ExplorerContextMenuItem,
  ExplorerContextMenuSeparator,
  ExplorerContextMenuTrigger,
} from "@/components/wiki/explorer/ExplorerContextMenu";
import type { ReactNode } from "react";

export interface ExplorerEmptySpaceMenuProps {
  children: ReactNode;
  onNewPage: () => void;
  onNewFolder: () => void;
}

/** Right-click on empty explorer canvas — new page here + new folder. */
export function ExplorerEmptySpaceMenu({
  children,
  onNewPage,
  onNewFolder,
}: ExplorerEmptySpaceMenuProps) {
  return (
    <ExplorerContextMenu>
      <ExplorerContextMenuTrigger asChild>{children}</ExplorerContextMenuTrigger>
      <ExplorerContextMenuContent>
        <ExplorerContextMenuItem onSelect={onNewPage}>New page here</ExplorerContextMenuItem>
        <ExplorerContextMenuItem onSelect={onNewFolder}>New folder</ExplorerContextMenuItem>
        <ExplorerContextMenuSeparator />
        <ExplorerContextMenuItem disabled>Paste</ExplorerContextMenuItem>
      </ExplorerContextMenuContent>
    </ExplorerContextMenu>
  );
}
