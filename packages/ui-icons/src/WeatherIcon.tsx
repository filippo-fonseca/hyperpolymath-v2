import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  ICON_CREASE,
  SheenGradient,
  useIconIds,
} from "./shared";

/**
 * Sun occluded by a raised cloud — the weather motif.
 *
 * The cloud is a union of three discs and a base bar sharing one flat fill, so
 * the overlaps leave no seams (a translucent fill would show every joint). The
 * sun sits a tone darker and behind, which is what sells the depth order.
 */
export function WeatherIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("weather");
  const cloud = "hsl(235 22% 90%)";

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

      {/* Sun behind, a tone down so the cloud stays the brightest thing. Placed
          to clear the cloud's shoulder by a few px: fully tucked it vanishes,
          fully clear it stops reading as "behind". */}
      <circle cx="53" cy="29" r="8" fill="hsl(235 18% 80%)" />
      <circle cx="53" cy="29" r="8" fill="none" stroke="white" strokeOpacity="0.35" />

      {/* Cloud: discs + base bar, one flat fill, unioned. */}
      <g fill={cloud}>
        <circle cx="39.5" cy="39.5" r="10.5" />
        <circle cx="33" cy="44.5" r="9" />
        <circle cx="46" cy="45" r="8" />
        <rect x="24" y="44.5" width="30" height="8.5" rx="4.25" />
      </g>
      {/* Underside crease so the cloud reads as raised off the tile. */}
      <path
        d="M28 53.4 H50"
        stroke={ICON_CREASE}
        strokeOpacity="0.4"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </DimensionalSvg>
  );
}
