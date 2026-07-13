import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  ICON_CREASE,
  SheenGradient,
  useIconIds,
} from "./shared";

/** Rounded checkbox tile with a raised, extruded checkmark. */
export function TaskIcon({ size = 40, dropTarget = false, className, title }: DimensionalIconProps) {
  const id = useIconIds("task");

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
      {/* under-crease then bright face gives the check its lift */}
      <path
        d="M26.5 42.6 L36 52 L54 31.8"
        stroke={ICON_CREASE}
        strokeOpacity="0.5"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26.5 41 L36 50.4 L54 30.2"
        stroke="white"
        strokeOpacity="0.95"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </DimensionalSvg>
  );
}
