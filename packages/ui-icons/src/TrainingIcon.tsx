import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  FaceGradient,
  ICON_CREASE,
  SheenGradient,
  useIconIds,
} from "./shared";

/** Dumbbell on a rounded tile — the training/workout motif. */
export function TrainingIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("training");

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
          <BodyGradient id={id.body} cx={26} cy={20} angle={53} sx={54} sy={62} />
          <FaceGradient id={id.face} x1={31} y1={37} x2={49} y2={43} />
          <SheenGradient id={id.sheen} y1={15} y2={52} />
        </>
      }
    >
      <rect x="13" y="15" width="54" height="54" rx="14" fill={`url(#${id.body})`} />
      <rect x="13" y="15" width="54" height="54" rx="14" fill={`url(#${id.sheen})`} />
      <path
        d="M24 16.4 H56"
        stroke="white"
        strokeOpacity="0.4"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* dumbbell: bar between two stacked plates */}
      <rect x="31" y="37" width="18" height="6" rx="3" fill={`url(#${id.face})`} />
      <rect x="25" y="30" width="6" height="20" rx="3" fill="hsl(235 22% 90%)" />
      <rect x="49" y="30" width="6" height="20" rx="3" fill="hsl(235 22% 90%)" />
      <rect x="18.5" y="33" width="5" height="14" rx="2.2" fill="hsl(235 18% 80%)" />
      <rect x="56.5" y="33" width="5" height="14" rx="2.2" fill="hsl(235 18% 80%)" />
      {/* bottom shading so the plates read as extruded */}
      <path
        d="M25.8 48.5 H30.2 M49.8 48.5 H54.2"
        stroke={ICON_CREASE}
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </DimensionalSvg>
  );
}
