import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  ICON_CREASE,
  SheenGradient,
  useIconIds,
} from "./shared";

/** Rounded gear ring — the settings motif. */
export function SettingsIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("settings");
  // Ring: outer r22, inner r9, even-odd for the hole — the HabitIcon donut at a
  // smaller radius, leaving room for the teeth to protrude to r27.
  const ring =
    "M40 18 A22 22 0 1 0 40 62 A22 22 0 1 0 40 18 Z M40 31 A9 9 0 1 0 40 49 A9 9 0 1 0 40 31 Z";
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315];

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
          <BodyGradient id={id.body} cx={24} cy={18} angle={53} sx={56} sy={62} />
          <SheenGradient id={id.sheen} y1={14} y2={58} />
        </>
      }
    >
      {/* Teeth first, so the ring covers where they sink into it. One shared
          userSpaceOnUse gradient lights all nine shapes as a single gear. */}
      {teeth.map((angle) => (
        <rect
          key={angle}
          x="36.4"
          y="13"
          width="7.2"
          height="10"
          rx="2"
          transform={`rotate(${angle} 40 40)`}
          fill={`url(#${id.body})`}
        />
      ))}
      <path d={ring} fillRule="evenodd" fill={`url(#${id.body})`} />
      {teeth.map((angle) => (
        <rect
          key={angle}
          x="36.4"
          y="13"
          width="7.2"
          height="10"
          rx="2"
          transform={`rotate(${angle} 40 40)`}
          fill={`url(#${id.sheen})`}
        />
      ))}
      <path d={ring} fillRule="evenodd" fill={`url(#${id.sheen})`} />

      {/* Outer top-left rim + hub crease for depth — as HabitIcon's ring does. */}
      <path
        d="M21 29 A22 22 0 0 1 47.6 19.4"
        stroke="white"
        strokeOpacity="0.45"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle
        cx="40"
        cy="40"
        r="9"
        fill="none"
        stroke={ICON_CREASE}
        strokeOpacity="0.4"
        strokeWidth="2"
      />
    </DimensionalSvg>
  );
}
