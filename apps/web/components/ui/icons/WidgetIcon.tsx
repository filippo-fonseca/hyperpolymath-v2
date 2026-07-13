import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  SheenGradient,
  useIconIds,
} from "./shared";

/** Two-by-two stacked tiles — the widget/dashboard motif. */
export function WidgetIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("widget");
  // Shared userSpaceOnUse gradient makes the top-left tile brightest and the
  // bottom-right darkest, so the four tiles read as one lit stack.
  const tiles = [
    { x: 16, y: 18 },
    { x: 42, y: 18 },
    { x: 16, y: 44 },
    { x: 42, y: 44 },
  ];
  const w = 22;

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
          <BodyGradient id={id.body} cx={20} cy={16} angle={50} sx={60} sy={64} />
          <SheenGradient id={id.sheen} y1={16} y2={62} />
        </>
      }
    >
      {tiles.map((t) => (
        <g key={`${t.x}-${t.y}`}>
          <rect x={t.x} y={t.y} width={w} height={w} rx="5.5" fill={`url(#${id.body})`} />
          <rect x={t.x} y={t.y} width={w} height={w} rx="5.5" fill={`url(#${id.sheen})`} />
          <path
            d={`M${t.x + 4} ${t.y + 1.5} H${t.x + w - 4}`}
            stroke="white"
            strokeOpacity="0.4"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </g>
      ))}
    </DimensionalSvg>
  );
}
