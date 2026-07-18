import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  ICON_CREASE,
  SheenGradient,
  useIconIds,
} from "./shared";

/** Dimensional streak ring — the recurring-habit loop. */
export function HabitIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("habit");
  // Donut: outer r26, inner r13, even-odd for the hole.
  const donut =
    "M40 14 A26 26 0 1 0 40 66 A26 26 0 1 0 40 14 Z M40 27 A13 13 0 1 0 40 53 A13 13 0 1 0 40 27 Z";

  return (
    <DimensionalSvg
      size={size}
      title={title}
      titleId={id.title}
      shadowId={id.shadow}
      dropTarget={dropTarget}
      className={className}
      defs={
        <>
          <BodyGradient id={id.body} cx={24} cy={18} angle={53} sx={56} sy={62} />
          <SheenGradient id={id.sheen} y1={14} y2={54} />
        </>
      }
    >
      <path d={donut} fillRule="evenodd" fill={`url(#${id.body})`} />
      <path d={donut} fillRule="evenodd" fill={`url(#${id.sheen})`} />
      {/* bright cap arc riding the band = the completed streak portion */}
      <path
        d="M40 20.5 A19.5 19.5 0 0 1 59.2 36.6"
        stroke="hsl(235 24% 90%)"
        strokeOpacity="0.92"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      {/* outer top-left rim + inner hole crease for depth */}
      <path
        d="M21.6 30 A26 26 0 0 1 49 15.6"
        stroke="white"
        strokeOpacity="0.45"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="40" cy="40" r="13" fill="none" stroke={ICON_CREASE} strokeOpacity="0.4" strokeWidth="2" />
    </DimensionalSvg>
  );
}
