import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  ICON_INNER_SHADOW,
  SheenGradient,
  useIconIds,
} from "./shared";

/**
 * Handset set into a speech bubble — the WhatsApp motif.
 *
 * Deliberately NOT the brand green: §1 allows one accent, and a green-bodied
 * icon would be the only off-palette thing in the column. The bubble silhouette
 * plus the receiver carries the recognition on its own, and the body keeps the
 * family's indigo material like every other icon here.
 *
 * Bubble and tail are separate shapes sharing one `userSpaceOnUse` gradient, so
 * they light as a single form and the joint disappears (the WidgetIcon trick).
 */
export function WhatsappIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("whatsapp");
  const tail = "M25 56 L25 69 L38 56 Z";
  // Receiver swept along the bubble's diagonal — a straight handset reads as a
  // dash once the icon is shrunk.
  const handset =
    "M34 27.5 Q30.6 29.6 31.2 33.8 Q32.2 39.5 37.4 44.7 Q42.6 49.9 48.3 50.9 Q52.5 51.5 54.6 48.1 L50 43.9 L45.6 45.6 Q42.2 43.2 39.1 40.1 Q36 37 33.6 33.6 L35.3 29.2 Z";

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
          <BodyGradient id={id.body} cx={26} cy={18} angle={53} sx={56} sy={62} />
          <SheenGradient id={id.sheen} y1={14} y2={56} />
        </>
      }
    >
      <path d={tail} fill={`url(#${id.body})`} />
      <rect x="13" y="16" width="54" height="42" rx="13" fill={`url(#${id.body})`} />
      <path d={tail} fill={`url(#${id.sheen})`} />
      <rect x="13" y="16" width="54" height="42" rx="13" fill={`url(#${id.sheen})`} />
      <path
        d="M24 17.4 H56"
        stroke="white"
        strokeOpacity="0.4"
        strokeWidth="1"
        strokeLinecap="round"
      />

      <path d={handset} fill={ICON_INNER_SHADOW} transform="translate(0 1.5)" />
      <path d={handset} fill="white" fillOpacity="0.92" />
    </DimensionalSvg>
  );
}
