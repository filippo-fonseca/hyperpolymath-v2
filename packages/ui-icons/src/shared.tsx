import { useId, type ReactNode } from "react";

import { cn } from "./cn";

/**
 * Shared recipe for the app's dimensional icon family (extracted from the wiki
 * FolderIcon/PageIcon). Every icon is an 80x80 SVG with `useId`-scoped defs, a
 * cool-indigo body material, a token-driven `feDropShadow`, and a dashed accent
 * drop-target state. The indigo material is the icon's identity; the accent
 * (`--sd-accent`, JARVIS cyan per D1b) appears ONLY in the drop-target frame,
 * never as a body fill. Both light and dark themes are first-class (D1c): the
 * shadow softness rides `--sd-icon-shadow*`, and the dark saturated body reads
 * on the light `--sd-app` surface without a per-theme file.
 */
export type DimensionalIconProps = {
  /** Rendered width/height in px. Icons read at 24px and shine at 48-80px. */
  size?: number;
  /** Show the dashed accent frame used while an item is a valid drop target. */
  dropTarget?: boolean;
  className?: string;
  /** Accessible label. When present the SVG is `role="img"`, else decorative. */
  title?: string;
};

/** Recessed inner-shadow tint shared with FolderIcon, for embossed depth. */
export const ICON_INNER_SHADOW = "hsl(225 36% 25% / 0.42)";
/** Darker crease tint for the underside of raised motifs. */
export const ICON_CREASE = "hsl(225 45% 14%)";

/** Scoped, collision-free ids for one icon instance. */
export function useIconIds(name: string) {
  const raw = useId().replace(/:/g, "");
  return {
    body: `${name}-body-${raw}`,
    face: `${name}-face-${raw}`,
    sheen: `${name}-sheen-${raw}`,
    shadow: `${name}-shadow-${raw}`,
    title: `${name}-title-${raw}`,
  };
}

/** Cool-indigo body material — identical stops to FolderIcon. */
export function BodyGradient({
  id,
  cx = 30,
  cy = 22,
  angle = 53,
  sx = 54,
  sy = 66,
}: {
  id: string;
  cx?: number;
  cy?: number;
  angle?: number;
  sx?: number;
  sy?: number;
}) {
  return (
    <radialGradient
      id={id}
      cx="0"
      cy="0"
      r="1"
      gradientUnits="userSpaceOnUse"
      gradientTransform={`translate(${cx} ${cy}) rotate(${angle}) scale(${sx} ${sy})`}
    >
      <stop stopColor="#6079C0" />
      <stop offset="0.48" stopColor="#40568E" />
      <stop offset="1" stopColor="#263454" />
    </radialGradient>
  );
}

/** Lighter indigo face for raised motif surfaces — matches FolderIcon's tab. */
export function FaceGradient({
  id,
  x1,
  y1,
  x2,
  y2,
}: {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
      <stop stopColor="#7489C8" />
      <stop offset="0.55" stopColor="#526AA8" />
      <stop offset="1" stopColor="#33436C" />
    </linearGradient>
  );
}

/** Top-down white specular that fades to nothing — gives the body volume. */
export function SheenGradient({
  id,
  x1 = 40,
  y1 = 14,
  x2 = 40,
  y2 = 60,
}: {
  id: string;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}) {
  return (
    <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
      <stop stopColor="white" stopOpacity="0.18" />
      <stop offset="0.5" stopColor="white" stopOpacity="0.05" />
      <stop offset="1" stopColor="white" stopOpacity="0" />
    </linearGradient>
  );
}

/**
 * Outer SVG shell: viewBox, a11y wiring, the token-driven drop shadow, and the
 * dashed accent drop-target frame. `defs` receives the icon's gradients; the
 * shadow filter is appended automatically and wraps `children`.
 */
export function DimensionalSvg({
  size = 40,
  title,
  titleId,
  shadowId,
  dropTarget = false,
  dropRect,
  defs,
  className,
  children,
}: {
  size?: number;
  title?: string;
  titleId?: string;
  shadowId: string;
  dropTarget?: boolean;
  dropRect?: { x: number; y: number; width: number; height: number; rx: number };
  defs: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const rect = dropRect ?? { x: 5, y: 8, width: 70, height: 64, rx: 12 };
  return (
    <svg
      role={title ? "img" : "presentation"}
      aria-labelledby={title ? titleId : undefined}
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      className={cn("shrink-0 overflow-visible", className)}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <defs>
        {defs}
        <filter
          id={shadowId}
          x="-25%"
          y="-25%"
          width="150%"
          height="160%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="0"
            dy="6"
            stdDeviation="5"
            floodColor="var(--sd-icon-shadow, hsl(235 15% 0%))"
            floodOpacity="var(--sd-icon-shadow-opacity, 0.18)"
          />
        </filter>
      </defs>

      {dropTarget ? (
        <rect
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          rx={rect.rx}
          stroke="var(--sd-accent, var(--hud-cyan))"
          strokeWidth="2"
          strokeDasharray="4 4"
          fill="color-mix(in srgb, var(--sd-accent, var(--hud-cyan)) 14%, transparent)"
        />
      ) : null}

      <g filter={`url(#${shadowId})`}>{children}</g>
    </svg>
  );
}
