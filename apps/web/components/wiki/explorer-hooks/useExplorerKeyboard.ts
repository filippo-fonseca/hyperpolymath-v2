"use client";

import type { ExplorerViewMode } from "@/components/wiki/explorer";
import type { ExplorerItem } from "@/components/wiki/explorer-types";
import { explorerItemId } from "@/components/wiki/explorer-types";
import type { RefObject } from "react";
import { useEffect } from "react";

interface Selection {
  clear: () => void;
  selectOnly: (ids: string[]) => void;
  cursor: string | null;
  moveCursor: (direction: "up" | "down" | "left" | "right", cols: number, shift: boolean) => void;
}

interface UseExplorerKeyboardArgs {
  selection: Selection;
  itemOrder: string[];
  visibleItems: ExplorerItem[];
  openItem: (item: ExplorerItem) => void;
  toggleInspector: () => void;
  view: ExplorerViewMode;
  canvasRef: RefObject<HTMLDivElement | null>;
  searchInputRef: RefObject<HTMLInputElement | null>;
}

/** Wires /, Cmd+A, Cmd+I, Esc, Enter, and arrow-nav on the explorer canvas. */
export function useExplorerKeyboard({
  selection,
  itemOrder,
  visibleItems,
  openItem,
  toggleInspector,
  view,
  canvasRef,
  searchInputRef,
}: UseExplorerKeyboardArgs) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const mod = event.metaKey || event.ctrlKey;
      if (event.key === "/" && !inField) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        selection.clear();
        return;
      }
      if (mod && event.key.toLowerCase() === "a" && !inField) {
        event.preventDefault();
        selection.selectOnly(itemOrder);
        return;
      }
      if (mod && event.key.toLowerCase() === "i" && !inField) {
        event.preventDefault();
        toggleInspector();
        return;
      }
      if (event.key === "Enter" && !inField && selection.cursor) {
        const id = selection.cursor;
        const item = visibleItems.find((it) => explorerItemId(it) === id);
        if (item) {
          event.preventDefault();
          openItem(item);
        }
        return;
      }
      if (
        !inField &&
        (event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight")
      ) {
        event.preventDefault();
        const direction = event.key.replace("Arrow", "").toLowerCase() as
          | "up"
          | "down"
          | "left"
          | "right";
        // Grid uses ~4 columns rough estimate; list is single-column.
        const cols = view === "grid" ? gridColumnCount(canvasRef.current) : 1;
        selection.moveCursor(direction, cols, event.shiftKey);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    canvasRef,
    itemOrder,
    openItem,
    searchInputRef,
    selection,
    toggleInspector,
    view,
    visibleItems,
  ]);
}

/** Rough column count for keyboard grid nav — reads inline template if the grid rendered. */
function gridColumnCount(container: HTMLElement | null): number {
  if (!container) return 1;
  const grid = container.querySelector<HTMLElement>('[data-view="grid"]');
  if (!grid) return 1;
  const style = window.getComputedStyle(grid);
  const template = style.gridTemplateColumns.split(" ").filter(Boolean);
  return Math.max(1, template.length);
}
