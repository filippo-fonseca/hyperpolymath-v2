import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  ICON_INNER_SHADOW,
  SheenGradient,
  useIconIds,
} from "./shared";

/**
 * Spark set into a round orb — the JARVIS motif (UI-CONTRACT §12).
 *
 * §12 called for a spark-in-TILE, but InsightIcon already *is* a four-point
 * spark on a rounded tile, and the two sit on adjacent SYSTEM rows. At 18px the
 * pair was indistinguishable — same motif, same material, same silhouette — so
 * the mascot stopped doing the one job a mascot has. The spark is kept (it is
 * the mandated motif and JARVIS's signature); the body becomes a circle, which
 * is the one change that separates them at a glance, since silhouette is all
 * you get at this size. It also lines up with §4, where the orb is already
 * JARVIS's presence lamp.
 *
 * Deliberately NOT accent-filled: cyan stays functional chrome on this surface,
 * and an accent-bodied icon would be the only glowing thing in the column.
 */
export function JarvisIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("jarvis");

  // Four-point spark with a long vertical axis — a symmetric star turns to mush
  // once the icon is shrunk into an 18px nav row.
  const spark =
    "M40 22 C41.7 32.6 45.8 36.7 56.4 38.4 C45.8 40.1 41.7 44.2 40 54.8 C38.3 44.2 34.2 40.1 23.6 38.4 C34.2 36.7 38.3 32.6 40 22 Z";

  return (
    <DimensionalSvg
      size={size}
      title={title}
      titleId={id.title}
      shadowId={id.shadow}
      dropTarget={dropTarget}
      dropRect={{ x: 6, y: 6, width: 68, height: 68, rx: 34 }}
      className={className}
      defs={
        <>
          <BodyGradient id={id.body} cx={24} cy={16} angle={52} sx={58} sy={64} />
          <SheenGradient id={id.sheen} y1={12} y2={64} />
        </>
      }
    >
      {/* Orb body + top-down specular. */}
      <circle cx="40" cy="40" r="28" fill={`url(#${id.body})`} />
      <circle cx="40" cy="40" r="28" fill={`url(#${id.sheen})`} />

      {/* The spark, lit from above: a shadow copy pushed down 1px reads as the
          crease under a raised motif — the same trick the folder's lip uses. */}
      <path d={spark} fill={ICON_INNER_SHADOW} transform="translate(0 1.5)" />
      <path d={spark} fill="white" opacity="0.72" />

      {/* Rim light across the top of the sphere. */}
      <path
        d="M22 27 A28 28 0 0 1 58 27"
        stroke="white"
        strokeOpacity="0.34"
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />
    </DimensionalSvg>
  );
}
