"use client";

import { useRef, useState } from "react";
import { useStudioDomTarget } from "@/lib/studio/input/react";
import type { StudioWidgetId } from "@/components/studio/data/useStudioData";

/**
 * DebugDomTiles — dev-only, deterministic hover targets for the mouse path
 * (Wave-2 deviation 6).
 *
 * Until `widget-cloud`'s raycast hover provider lands, nothing resolves a hover
 * target, so the mouse driver's `expand` (upgraded from the current hover) can
 * never fire. These five invisible, geometry-only strips register real DOM rects
 * via `useStudioDomTarget`, so moving the cursor over a strip and clicking emits
 * `expand{id}` — making the overlay open/collapse Playwright-testable standalone.
 *
 * Gated on `?studioDomTiles=1` and tree-shaken from the normal flow otherwise.
 * `pointer-events-none` + `opacity-0` keep them purely a coordinate substrate;
 * hover resolution is geometric (getBoundingClientRect), not DOM-event driven.
 */

const TILE_IDS: readonly StudioWidgetId[] = [
  "tasks",
  "captures",
  "agenda",
  "habits",
  "journal",
];

function DomTile({
  id,
  index,
  count,
}: {
  id: StudioWidgetId;
  index: number;
  count: number;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useStudioDomTarget(id, ref);
  return (
    <div
      ref={ref}
      data-testid={`studio-dom-tile-${id}`}
      className="pointer-events-none absolute top-0 bottom-0 opacity-0"
      style={{ left: `${(index / count) * 100}%`, width: `${100 / count}%` }}
    />
  );
}

export function DebugDomTiles(): React.ReactElement | null {
  // Read the gate once — the query param is stable for the session, so the hook
  // count below never changes across renders.
  const [enabled] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("studioDomTiles") === "1",
  );

  if (!enabled) return null;

  return (
    <div aria-hidden className="absolute inset-0 z-0">
      {TILE_IDS.map((id, i) => (
        <DomTile key={id} id={id} index={i} count={TILE_IDS.length} />
      ))}
    </div>
  );
}

export default DebugDomTiles;
