import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  FaceGradient,
  ICON_CREASE,
  SheenGradient,
  useIconIds,
} from "./shared";

/** Inbox tray receiving a dropped item — the quick-capture motif. */
export function CaptureIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("capture");
  const tray = "M23 43 H33 L37 49 H43 L47 43 H57 V54 Q57 57 54 57 H26 Q23 57 23 54 Z";

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
          <FaceGradient id={id.face} x1={23} y1={43} x2={57} y2={57} />
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
      {/* item dropping into the tray */}
      <path d="M40 23 V38.5" stroke="white" strokeOpacity="0.95" strokeWidth="5" strokeLinecap="round" />
      <path
        d="M33.6 33 L40 39.6 L46.4 33"
        stroke="white"
        strokeOpacity="0.95"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* raised tray with a receiving slot */}
      <path d={tray} fill={`url(#${id.face})`} />
      <path
        d="M23 43 H33 L37 49 H43 L47 43 H57"
        stroke="white"
        strokeOpacity="0.55"
        strokeWidth="1"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M25 54.5 H55" stroke={ICON_CREASE} strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round" />
    </DimensionalSvg>
  );
}
