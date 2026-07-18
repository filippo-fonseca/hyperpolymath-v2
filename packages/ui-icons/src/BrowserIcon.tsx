import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  ICON_CREASE,
  ICON_INNER_SHADOW,
  SheenGradient,
  useIconIds,
} from "./shared";

/**
 * Window with a chrome bar and address pill — the browser motif.
 *
 * The traffic-light dots and the pill are what separate this from NewsIcon at
 * 18px, where both are just a pale rectangle on a tile. Everything inside the
 * window is a crease into the pale face, never a lighter mark on it.
 */
export function BrowserIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("browser");
  const dots = [26, 30.5, 35];

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

      {/* Raised window: crease copy, then the pale face. */}
      <rect x="21" y="28.5" width="38" height="28" rx="3.5" fill={ICON_INNER_SHADOW} />
      <rect x="21" y="27" width="38" height="28" rx="3.5" fill="hsl(235 22% 90%)" />

      {/* Chrome bar: traffic lights, address pill, then the rule under it. */}
      {dots.map((cx) => (
        <circle key={cx} cx={cx} cy="30.6" r="1.4" fill={ICON_CREASE} fillOpacity="0.45" />
      ))}
      <rect
        x="39.5"
        y="28.4"
        width="17"
        height="4.4"
        rx="2.2"
        fill={ICON_CREASE}
        fillOpacity="0.25"
      />
      <path d="M21 34.5 H59" stroke={ICON_CREASE} strokeOpacity="0.4" strokeWidth="1.5" />

      {/* Page content. */}
      <path
        d="M26 42 H54 M26 48 H46"
        stroke={ICON_CREASE}
        strokeOpacity="0.3"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </DimensionalSvg>
  );
}
