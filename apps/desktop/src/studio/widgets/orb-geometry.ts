export interface OrbStageSize {
  width: number;
  height: number;
}

export interface OrbTargetGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getOrbTargetGeometry(
  stage: OrbStageSize,
  active: boolean,
): OrbTargetGeometry {
  if (!active) {
    const diameter = Math.min(300, stage.height * 0.42, stage.width * 0.28);
    return {
      x: 0.5,
      y: 0.5,
      w: diameter / stage.width,
      h: diameter / stage.height,
    };
  }

  const diameter = Math.min(124, stage.height * 0.2, stage.width * 0.12);
  const w = Math.max(0.16, diameter / stage.width);
  const h = Math.max(0.16, diameter / stage.height);
  return {
    x: 1 - w / 2 - 32 / stage.width,
    y: 1 - h / 2 - 32 / stage.height,
    w,
    h,
  };
}
