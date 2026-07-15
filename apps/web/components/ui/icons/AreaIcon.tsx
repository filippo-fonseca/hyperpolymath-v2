import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  FaceGradient,
  ICON_CREASE,
  SheenGradient,
  useIconIds,
} from "./shared";

/** Rounded-diamond compass — the container/area motif of the icon family. */
export function AreaIcon({ size = 40, dropTarget = false, className, title }: DimensionalIconProps) {
  const id = useIconIds("area");
  // Rounded diamond, vertices T(40,15) R(65,40) B(40,65) L(15,40), 7px corners.
  const diamond =
    "M44.95 19.95 L60.05 35.05 Q65 40 60.05 44.95 L44.95 60.05 Q40 65 35.05 60.05 L19.95 44.95 Q15 40 19.95 35.05 L35.05 19.95 Q40 15 44.95 19.95 Z";

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
          <BodyGradient id={id.body} cx={28} cy={20} angle={55} sx={52} sy={60} />
          <FaceGradient id={id.face} x1={34} y1={26} x2={46} y2={42} />
          <SheenGradient id={id.sheen} y1={16} y2={50} />
        </>
      }
    >
      <path d={diamond} fill={`url(#${id.body})`} />
      <path d={diamond} fill={`url(#${id.sheen})`} />
      {/* compass needle: bright north, dull south, pivoting on a pale hub */}
      <path d="M40 25.5 L44.6 41 L35.4 41 Z" fill={`url(#${id.face})`} />
      <path d="M40 54.5 L44.6 41 L35.4 41 Z" fill="hsl(225 42% 22%)" />
      <path d="M40 25.5 L35.4 41" stroke="white" strokeOpacity="0.35" strokeWidth="1" />
      <circle cx="40" cy="41" r="3.4" fill="hsl(235 20% 92%)" />
      <circle cx="40" cy="41" r="3.4" fill="none" stroke={ICON_CREASE} strokeOpacity="0.35" />
      {/* top-left rim highlight for the extruded edge */}
      <path
        d="M35.05 19.95 Q40 15 44.95 19.95"
        stroke="white"
        strokeOpacity="0.5"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </DimensionalSvg>
  );
}
