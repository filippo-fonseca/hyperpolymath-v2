"use client";

/**
 * View-mode + zoom persistence for the projects timeline (u3-timeline-core).
 *
 * Follows the `lifeos:view` idiom verbatim (LifeOsCanvas.tsx:38-65), which is
 * the repo's SSR-safe answer to a persisted view toggle:
 *   - `useState(DEFAULT)` so the server render and the first client paint agree
 *     (hydration never mismatches — localStorage is NEVER touched during render).
 *   - A mount effect reads and validates the stored value, reconciling to it.
 *   - The write happens INSIDE the setter, not in a mirror effect. A mirror
 *     effect would echo the value straight back on load.
 *
 * Unknown or corrupt stored values fall back to the default silently; a broken
 * localStorage entry should never be able to break the page.
 */

import { useCallback, useEffect, useState } from "react";

import type { TimelineZoom } from "@/lib/projects/timeline";

export type AreasView = "tree" | "timeline";

export const VIEW_STORAGE_KEY = "areas:view";
export const ZOOM_STORAGE_KEY = "areas:timeline-zoom";

export const DEFAULT_VIEW: AreasView = "tree";
/** DESIGN.md seals Months as the default zoom. */
export const DEFAULT_ZOOM: TimelineZoom = "months";

const VIEWS: readonly AreasView[] = ["tree", "timeline"];
const ZOOMS: readonly TimelineZoom[] = ["weeks", "months", "quarters"];

function isView(value: unknown): value is AreasView {
  return typeof value === "string" && (VIEWS as readonly string[]).includes(value);
}

function isZoom(value: unknown): value is TimelineZoom {
  return typeof value === "string" && (ZOOMS as readonly string[]).includes(value);
}

interface TimelineViewState {
  view: AreasView;
  setView: (next: AreasView) => void;
  zoom: TimelineZoom;
  setZoom: (next: TimelineZoom) => void;
}

export function useTimelineView(): TimelineViewState {
  const [view, setViewState] = useState<AreasView>(DEFAULT_VIEW);
  const [zoom, setZoomState] = useState<TimelineZoom>(DEFAULT_ZOOM);

  useEffect(() => {
    try {
      const storedView = localStorage.getItem(VIEW_STORAGE_KEY);
      if (isView(storedView)) setViewState(storedView);
      const storedZoom = localStorage.getItem(ZOOM_STORAGE_KEY);
      if (isZoom(storedZoom)) setZoomState(storedZoom);
    } catch {
      /* localStorage unavailable (private mode, blocked) — stay on defaults. */
    }
  }, []);

  const setView = useCallback((next: AreasView) => {
    setViewState(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* Persistence is best-effort; the view still changes for this session. */
    }
  }, []);

  const setZoom = useCallback((next: TimelineZoom) => {
    setZoomState(next);
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, next);
    } catch {
      /* Persistence is best-effort; the zoom still changes for this session. */
    }
  }, []);

  return { view, setView, zoom, setZoom };
}
