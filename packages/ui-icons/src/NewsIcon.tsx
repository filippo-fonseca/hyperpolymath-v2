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
 * Newspaper sheet with a masthead — the news/feed motif.
 *
 * Paper takes the pale face rather than the indigo `FaceGradient`: the sheet has
 * to out-value the tile it sits on or the whole glyph flattens. Column rules and
 * the cut-out photo box are creases into that sheet, so they darken instead of
 * lighten, which keeps the paper the top-most plane.
 *
 * A second sheet peeks out behind the first. Without it News and Browser are the
 * same pale rectangle on the same tile once shrunk to 18px, where interior
 * detail is gone and silhouette is all that survives; the stack also says
 * "feed" rather than "a page". Stacking to disambiguate is WidgetIcon's trick.
 */
export function NewsIcon({ size = 40, dropTarget = false, className, title }: DimensionalIconProps) {
  const id = useIconIds("news");

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

      {/* Sheet behind, then the shadow copy pushed down 1.5px = the crease under
          a raised sheet, then the front face. */}
      <rect x="27" y="22" width="30" height="10" rx="2.5" fill="hsl(235 18% 80%)" />
      <rect x="22" y="27.5" width="36" height="30" rx="3" fill={ICON_INNER_SHADOW} />
      <rect x="22" y="26" width="36" height="30" rx="3" fill="hsl(235 22% 90%)" />

      {/* Masthead bar, column rules, and a cut-out photo box. */}
      <rect x="26" y="30" width="28" height="5" rx="1.5" fill={ICON_CREASE} fillOpacity="0.45" />
      <path
        d="M26 41 H43 M26 46.5 H43 M26 52 H37"
        stroke={ICON_CREASE}
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="46.5" y="39.5" width="7.5" height="8" rx="1.5" fill={ICON_CREASE} fillOpacity="0.3" />
    </DimensionalSvg>
  );
}
