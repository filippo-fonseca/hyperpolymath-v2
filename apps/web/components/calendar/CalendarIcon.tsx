import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  ICON_CREASE,
  SheenGradient,
  useIconIds,
} from "@/components/ui/icons/shared";

/**
 * `CalendarIcon` — the dimensional feature glyph for /calendar.
 *
 * There is no calendar icon in the shared `components/ui/icons` set (that
 * directory belongs to unit-primitives), so this unit ships its own that
 * CONSUMES the shared dimensional recipe (`DimensionalSvg` + `BodyGradient`
 * + `SheenGradient`) — same 80×80 viewBox, cool-indigo body material,
 * token-driven drop shadow, white top hairline, and under-crease depth as
 * TaskIcon/WidgetIcon. Per the recipe, the accent (`--sd-accent`) only ever
 * appears in the drop-target frame, never as a body fill: the motif reads in
 * pure indigo + white specular so it sits in the same family as the sidebar.
 *
 * Motif: a rounded calendar tile with two binding tabs at the top, a header
 * band separated by an under-crease, and a 3×2 grid of raised day cells.
 */
export function CalendarIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("calendar");

  // 3×2 grid of day cells inside the body's lower region.
  const cellW = 9;
  const cellH = 7.5;
  const cols = [21, 35.5, 50];
  const rows = [43, 55];

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
          <SheenGradient id={id.sheen} y1={15} y2={54} />
        </>
      }
    >
      {/* Binding tabs — read as the two rings at the top of a wall calendar. */}
      <rect x="26" y="11" width="6" height="10" rx="3" fill={`url(#${id.body})`} />
      <rect x="48" y="11" width="6" height="10" rx="3" fill={`url(#${id.body})`} />

      {/* Calendar body + top specular sheen. */}
      <rect x="13" y="16" width="54" height="52" rx="13" fill={`url(#${id.body})`} />
      <rect x="13" y="16" width="54" height="52" rx="13" fill={`url(#${id.sheen})`} />
      <path
        d="M24 17.4 H56"
        stroke="white"
        strokeOpacity="0.4"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Header band divider — under-crease then a hairline face give it lift. */}
      <path
        d="M13 33.5 H67"
        stroke={ICON_CREASE}
        strokeOpacity="0.5"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M13 32.6 H67"
        stroke="white"
        strokeOpacity="0.16"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Day cells — raised white faces over a crease shadow. */}
      {rows.map((y) =>
        cols.map((x) => (
          <g key={`${x}-${y}`}>
            <rect
              x={x}
              y={y + 0.9}
              width={cellW}
              height={cellH}
              rx="2.4"
              fill={ICON_CREASE}
              fillOpacity="0.45"
            />
            <rect
              x={x}
              y={y}
              width={cellW}
              height={cellH}
              rx="2.4"
              fill="white"
              fillOpacity="0.9"
            />
          </g>
        )),
      )}
    </DimensionalSvg>
  );
}
