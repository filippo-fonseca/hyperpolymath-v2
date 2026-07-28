"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface RubberBandRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UseRubberBandSelectionArgs {
  /** Container the rubber-band lives inside — coordinates are relative to this element. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Fires with the ids intersecting the marquee. Called only when the set changes. */
  onSelection: (ids: string[]) => void;
  /** How the DOM tags item candidates — every candidate should have `data-explorer-id="<id>"`. */
  itemSelector?: string;
  /** Skip the gesture if the pointerdown target matches this selector (e.g. tiles that own their own drag). */
  ignoreSelector?: string;
  /** Min drag distance before the marquee shows (default 4px). */
  threshold?: number;
}

export interface UseRubberBandSelectionResult {
  rect: RubberBandRect | null;
  active: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
}

/**
 * Rubber-band marquee gesture. Fires `onSelection` with the ids of every item
 * whose bounding rect intersects the marquee. Pure DOM math against
 * `data-explorer-id` attributes — the caller keeps ownership of the selection
 * store; this hook only reports the intersection.
 */
export function useRubberBandSelection({
  containerRef,
  onSelection,
  itemSelector = "[data-explorer-id]",
  ignoreSelector,
  threshold = 4,
}: UseRubberBandSelectionArgs): UseRubberBandSelectionResult {
  const [rect, setRect] = useState<RubberBandRect | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const lastIdsRef = useRef<string>("");

  const finish = useCallback(() => {
    originRef.current = null;
    setRect(null);
    lastIdsRef.current = "";
  }, []);

  useEffect(() => {
    if (!originRef.current) return;

    function handleMove(event: PointerEvent) {
      const origin = originRef.current;
      const container = containerRef.current;
      if (!origin || !container) return;
      const bounds = container.getBoundingClientRect();
      const currentX = event.clientX - bounds.left + container.scrollLeft;
      const currentY = event.clientY - bounds.top + container.scrollTop;
      const dx = currentX - origin.x;
      const dy = currentY - origin.y;
      if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

      const x = Math.min(origin.x, currentX);
      const y = Math.min(origin.y, currentY);
      const width = Math.abs(dx);
      const height = Math.abs(dy);
      const nextRect: RubberBandRect = { x, y, width, height };
      setRect(nextRect);

      const containerBounds = container.getBoundingClientRect();
      const nodes = container.querySelectorAll<HTMLElement>(itemSelector);
      const ids: string[] = [];
      for (const node of nodes) {
        const id = node.dataset.explorerId;
        if (!id) continue;
        const rectDom = node.getBoundingClientRect();
        const rx = rectDom.left - containerBounds.left + container.scrollLeft;
        const ry = rectDom.top - containerBounds.top + container.scrollTop;
        const rw = rectDom.width;
        const rh = rectDom.height;
        const intersects = rx < x + width && rx + rw > x && ry < y + height && ry + rh > y;
        if (intersects) ids.push(id);
      }
      const key = ids.join("|");
      if (key !== lastIdsRef.current) {
        lastIdsRef.current = key;
        onSelection(ids);
      }
    }

    function handleUp() {
      finish();
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [containerRef, finish, itemSelector, onSelection, rect, threshold]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const container = containerRef.current;
      if (!container) return;
      const target = event.target as HTMLElement;
      if (ignoreSelector && target.closest(ignoreSelector)) return;
      // Only initiate on the empty canvas — anywhere over a real item is
      // handled by that item's own click/drag surface.
      if (target.closest(itemSelector) && target.closest(itemSelector) !== container) {
        return;
      }
      const bounds = container.getBoundingClientRect();
      originRef.current = {
        x: event.clientX - bounds.left + container.scrollLeft,
        y: event.clientY - bounds.top + container.scrollTop,
      };
      lastIdsRef.current = "";
    },
    [containerRef, ignoreSelector, itemSelector]
  );

  return { rect, active: rect !== null, onPointerDown };
}
