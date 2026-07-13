export interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MARGIN = 0.012;
// MINOR-2 — the stage's usable vertical center biases slightly UP (0.48
// vs 0.5) to leave breathing room for the bottom dock strip. Named so the
// intent is legible and the three call sites stay in sync.
const STAGE_VERTICAL_CENTER = 0.48;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Keep a center-anchored normalized window wholly inside the stage. */
export function clampToStage(rect: WindowRect): WindowRect {
  const w = clamp(rect.w, 0.16, 1 - MARGIN * 2);
  const h = clamp(rect.h, 0.16, 1 - MARGIN * 2);
  return {
    x: clamp(rect.x, w / 2 + MARGIN, 1 - w / 2 - MARGIN),
    y: clamp(rect.y, h / 2 + MARGIN, 1 - h / 2 - MARGIN),
    w,
    h,
  };
}

const SPAWN_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [-0.19, -0.12],
  [0.19, -0.1],
  [-0.17, 0.15],
  [0.18, 0.16],
  [0, -0.2],
  [0, 0.21],
];

/** Pick the least-overlapped deterministic spawn point around stage center. */
export function pickSpawnPosition(
  existing: readonly Pick<WindowRect, "x" | "y">[],
  size: Pick<WindowRect, "w" | "h">,
): Pick<WindowRect, "x" | "y"> {
  let best = SPAWN_OFFSETS[0]!;
  let bestDistance = -1;
  for (const offset of SPAWN_OFFSETS) {
    const candidate = clampToStage({
      x: 0.5 + offset[0],
      y: STAGE_VERTICAL_CENTER + offset[1],
      ...size,
    });
    const nearest = existing.reduce(
      (min, item) =>
        Math.min(min, Math.hypot(candidate.x - item.x, candidate.y - item.y)),
      Number.POSITIVE_INFINITY,
    );
    if (nearest > bestDistance) {
      bestDistance = nearest;
      best = [candidate.x - 0.5, candidate.y - STAGE_VERTICAL_CENTER];
    }
  }
  return { x: 0.5 + best[0], y: STAGE_VERTICAL_CENTER + best[1] };
}

/** Next stack value, independent of array order. */
export function nextStackOrder(items: readonly { z: number }[]): number {
  return items.reduce((highest, item) => Math.max(highest, item.z), 0) + 1;
}
