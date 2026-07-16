import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  SheenGradient,
  useIconIds,
} from "./shared";

/** Four-point spark on a rounded tile — the insight/AI-suggestion motif. */
export function InsightIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("insight");
  const glowId = `insight-glow-${id.title}`;
  const spark =
    "M40 24 C41.6 35.4 45.6 39.4 57 41 C45.6 42.6 41.6 46.6 40 58 C38.4 46.6 34.4 42.6 23 41 C34.4 39.4 38.4 35.4 40 24 Z";

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
          <radialGradient
            id={glowId}
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(40 41) scale(18)"
          >
            <stop stopColor="white" stopOpacity="0.95" />
            <stop offset="0.6" stopColor="hsl(235 30% 90%)" stopOpacity="0.9" />
            <stop offset="1" stopColor="hsl(235 40% 80%)" stopOpacity="0.7" />
          </radialGradient>
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
      <path d={spark} fill={`url(#${glowId})`} />
      {/* secondary micro-spark, top-right */}
      <path
        d="M55 23 C55.3 26 56 26.7 59 27 C56 27.3 55.3 28 55 31 C54.7 28 54 27.3 51 27 C54 26.7 54.7 26 55 23 Z"
        fill="white"
        fillOpacity="0.8"
      />
    </DimensionalSvg>
  );
}
