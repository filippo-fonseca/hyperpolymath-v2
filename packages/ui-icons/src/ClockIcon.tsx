import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  ICON_CREASE,
  SheenGradient,
  useIconIds,
} from "./shared";

/**
 * Round dial with raised hands — the clock/time motif.
 *
 * Circular body rather than the family's rounded tile: the desktop HUD shows
 * Clock next to Weather and News, and a dial is the one silhouette that still
 * says "time" once shrunk into an 18px widget header.
 *
 * Hands read 4:00, NOT the showroom 10:10 — a symmetric pair collapses into a
 * "V" at small sizes, which is TaskIcon's checkmark and JarvisIcon's spark. One
 * long vertical hand against one short diagonal is unambiguous at any size.
 */
export function ClockIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("clock");

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
      <circle cx="40" cy="40" r="28" fill={`url(#${id.body})`} />
      <circle cx="40" cy="40" r="28" fill={`url(#${id.sheen})`} />

      {/* Cardinal ticks only — twelve of them turn to a smudge at 18px. */}
      <path
        d="M40 19.5 V24 M60.5 40 H56 M40 60.5 V56 M19.5 40 H24"
        stroke="white"
        strokeOpacity="0.5"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Under-crease then bright face gives the hands their lift. */}
      <path
        d="M40 41.5 L40 27.5 M40 41.5 L48.5 46.4"
        stroke={ICON_CREASE}
        strokeOpacity="0.5"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M40 40 L40 26 M40 40 L48.5 44.9"
        stroke="white"
        strokeOpacity="0.95"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="40" cy="40" r="3.2" fill="hsl(235 20% 92%)" />
      <circle cx="40" cy="40" r="3.2" fill="none" stroke={ICON_CREASE} strokeOpacity="0.35" />

      {/* Rim light across the top of the dial. */}
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
