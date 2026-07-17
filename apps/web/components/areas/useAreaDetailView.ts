"use client";

/**
 * Page-scoped view toggle for /areas/[areaId] (grid | timeline).
 *
 * A deliberately SEPARATE hook from the areas-index `useTimelineView`
 * (components/projects/timeline/**, frozen for u5): that one is keyed
 * `areas:view` with a "tree" | "timeline" vocabulary and a "tree" default, none
 * of which fit an area page. The zoom preference is NOT duplicated here — the
 * timeline shares the one `areas:timeline-zoom` key through the frozen hook, so
 * zoom follows the user between /areas and a detail page for free.
 *
 * Follows the `lifeos:view` idiom verbatim (LifeOsCanvas.tsx:38-65), the repo's
 * SSR-safe answer to a persisted view toggle:
 *   - `useState(DEFAULT)` so the server render and the first client paint agree
 *     (localStorage is NEVER read during render — hydration never mismatches).
 *   - A mount effect reads and validates the stored value, reconciling to it.
 *   - The write happens INSIDE the setter, not a mirror effect (a mirror effect
 *     would echo the loaded value straight back).
 *
 * Unknown or corrupt stored values fall back to the default silently.
 */

import { useCallback, useEffect, useState } from "react";

export type AreaDetailView = "grid" | "timeline";

export const AREA_DETAIL_VIEW_KEY = "area-detail:view";
export const DEFAULT_AREA_DETAIL_VIEW: AreaDetailView = "grid";

const VIEWS: readonly AreaDetailView[] = ["grid", "timeline"];

function isView(value: unknown): value is AreaDetailView {
  return typeof value === "string" && (VIEWS as readonly string[]).includes(value);
}

interface AreaDetailViewState {
  view: AreaDetailView;
  setView: (next: AreaDetailView) => void;
}

export function useAreaDetailView(): AreaDetailViewState {
  const [view, setViewState] = useState<AreaDetailView>(DEFAULT_AREA_DETAIL_VIEW);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AREA_DETAIL_VIEW_KEY);
      if (isView(stored)) setViewState(stored);
    } catch {
      /* localStorage unavailable (private mode, blocked) — stay on the default. */
    }
  }, []);

  const setView = useCallback((next: AreaDetailView) => {
    setViewState(next);
    try {
      localStorage.setItem(AREA_DETAIL_VIEW_KEY, next);
    } catch {
      /* Persistence is best-effort; the view still changes for this session. */
    }
  }, []);

  return { view, setView };
}
