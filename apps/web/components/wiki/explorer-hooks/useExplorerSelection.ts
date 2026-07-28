"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/**
 * A single stable id for anything selectable inside the Explorer. Pages use
 * `page:<uuid>`, folders use `folder:<uuid>`; the caller decodes the tag when
 * it needs to route on kind.
 */
export type ExplorerSelectionId = string;

/**
 * Compute the closed range [min(a, b), max(a, b)] within an ordered list of ids.
 * Returns `[]` if either endpoint is missing so a shift-click across a stale
 * anchor is a no-op instead of an accidental "select everything".
 */
export function rangeBetween(
  a: ExplorerSelectionId | null,
  b: ExplorerSelectionId,
  order: ExplorerSelectionId[],
): ExplorerSelectionId[] {
  if (!a) return [b];
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0) return [b];
  const [lo, hi] = i <= j ? [i, j] : [j, i];
  return order.slice(lo, hi + 1);
}

export interface SelectionClickModifiers {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

export interface UseExplorerSelectionResult {
  selected: Set<ExplorerSelectionId>;
  anchor: ExplorerSelectionId | null;
  cursor: ExplorerSelectionId | null;
  isSelected: (id: ExplorerSelectionId) => boolean;
  onItemClick: (id: ExplorerSelectionId, mods: SelectionClickModifiers) => void;
  selectOnly: (ids: ExplorerSelectionId[]) => void;
  addAll: (ids: ExplorerSelectionId[]) => void;
  clear: () => void;
  moveCursor: (direction: "up" | "down" | "left" | "right", columns: number, extend: boolean) => void;
  setOrder: (order: ExplorerSelectionId[]) => void;
}

/**
 * Selection state engine for the Explorer. Owns the selected set, the
 * anchor for shift-range extension, and the cursor for keyboard navigation.
 * `order` (the visible id list) is a required argument so keyboard math and
 * shift-range work; callers pass the sorted/filtered ids for the current view.
 */
export function useExplorerSelection(
  initialOrder: ExplorerSelectionId[] = [],
): UseExplorerSelectionResult {
  const [selected, setSelected] = useState<Set<ExplorerSelectionId>>(new Set());
  const [anchor, setAnchor] = useState<ExplorerSelectionId | null>(null);
  const [cursor, setCursor] = useState<ExplorerSelectionId | null>(null);
  const orderRef = useRef<ExplorerSelectionId[]>(initialOrder);

  const setOrder = useCallback((next: ExplorerSelectionId[]) => {
    orderRef.current = next;
  }, []);

  const isSelected = useCallback((id: ExplorerSelectionId) => selected.has(id), [selected]);

  const selectOnly = useCallback((ids: ExplorerSelectionId[]) => {
    setSelected(new Set(ids));
    setAnchor(ids[0] ?? null);
    setCursor(ids[ids.length - 1] ?? null);
  }, []);

  const addAll = useCallback((ids: ExplorerSelectionId[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    setAnchor((prev) => prev ?? ids[0] ?? null);
    setCursor(ids[ids.length - 1] ?? null);
  }, []);

  // Functional updates that return `prev` unchanged when the selection is
  // already empty, so React bails out. `clear` is called on every folder
  // navigation; allocating a fresh Set there forced a second render pass and a
  // new `selection` identity through the memo below, which in turn refired every
  // effect keyed on it. Clearing nothing now costs nothing.
  const clear = useCallback(() => {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
    setAnchor((prev) => (prev === null ? prev : null));
    setCursor((prev) => (prev === null ? prev : null));
  }, []);

  const onItemClick = useCallback(
    (id: ExplorerSelectionId, mods: SelectionClickModifiers) => {
      const additive = Boolean(mods.metaKey || mods.ctrlKey);
      const ranged = Boolean(mods.shiftKey);
      if (ranged) {
        const ids = rangeBetween(anchor, id, orderRef.current);
        setSelected((prev) => {
          const next = additive ? new Set(prev) : new Set<ExplorerSelectionId>();
          for (const rid of ids) next.add(rid);
          return next;
        });
        setCursor(id);
        return;
      }
      if (additive) {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        setAnchor(id);
        setCursor(id);
        return;
      }
      setSelected(new Set([id]));
      setAnchor(id);
      setCursor(id);
    },
    [anchor],
  );

  const moveCursor = useCallback(
    (direction: "up" | "down" | "left" | "right", columns: number, extend: boolean) => {
      const order = orderRef.current;
      if (order.length === 0) return;
      const currentIndex = cursor ? order.indexOf(cursor) : -1;
      const start = currentIndex >= 0 ? currentIndex : 0;
      let target = start;
      const cols = Math.max(1, columns);
      switch (direction) {
        case "up":
          target = Math.max(0, start - cols);
          break;
        case "down":
          target = Math.min(order.length - 1, start + cols);
          break;
        case "left":
          target = Math.max(0, start - 1);
          break;
        case "right":
          target = Math.min(order.length - 1, start + 1);
          break;
      }
      const nextId = order[target];
      if (!nextId) return;
      if (extend) {
        const ids = rangeBetween(anchor ?? nextId, nextId, order);
        setSelected(new Set(ids));
        setCursor(nextId);
        return;
      }
      setSelected(new Set([nextId]));
      setAnchor(nextId);
      setCursor(nextId);
    },
    [anchor, cursor],
  );

  return useMemo(
    () => ({
      selected,
      anchor,
      cursor,
      isSelected,
      onItemClick,
      selectOnly,
      addAll,
      clear,
      moveCursor,
      setOrder,
    }),
    [
      selected,
      anchor,
      cursor,
      isSelected,
      onItemClick,
      selectOnly,
      addAll,
      clear,
      moveCursor,
      setOrder,
    ],
  );
}
