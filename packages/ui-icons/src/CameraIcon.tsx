import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  ICON_CREASE,
  SheenGradient,
  useIconIds,
} from "./shared";

/**
 * Camera body with a recessed lens — the camera/vision motif.
 *
 * The body is a wide rounded rect with a viewfinder bump rather than the family
 * tile, because Camera sits beside Browser and News on the HUD and a squared
 * tile would make all three the same silhouette. The lens inverts the family's
 * usual lift: it tunnels IN (dark well, bright rim, off-centre glint) while
 * every other motif stands proud, which is what makes it read as glass.
 */
export function CameraIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("camera");

  return (
    <DimensionalSvg
      size={size}
      title={title}
      titleId={id.title}
      shadowId={id.shadow}
      dropTarget={dropTarget}
      dropRect={{ x: 5, y: 12, width: 70, height: 58, rx: 12 }}
      className={className}
      defs={
        <>
          <BodyGradient id={id.body} cx={24} cy={22} angle={50} sx={56} sy={56} />
          <SheenGradient id={id.sheen} y1={18} y2={58} />
        </>
      }
    >
      {/* Viewfinder bump first so the body swallows its lower edge. */}
      <rect x="30" y="18" width="16" height="9" rx="3" fill={`url(#${id.body})`} />
      <rect x="13" y="24" width="54" height="40" rx="11" fill={`url(#${id.body})`} />
      <rect x="30" y="18" width="16" height="9" rx="3" fill={`url(#${id.sheen})`} />
      <rect x="13" y="24" width="54" height="40" rx="11" fill={`url(#${id.sheen})`} />
      <path
        d="M24 25.4 H56"
        stroke="white"
        strokeOpacity="0.4"
        strokeWidth="1"
        strokeLinecap="round"
      />

      {/* Lens: bright barrel, dark well, rim light, glint. */}
      <circle cx="40" cy="44" r="13" fill="hsl(235 18% 80%)" />
      <circle cx="40" cy="44" r="9.5" fill={ICON_CREASE} />
      <path
        d="M31.5 39.5 A9.5 9.5 0 0 1 48.5 39.5"
        stroke="white"
        strokeOpacity="0.28"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="35.8" cy="39.8" r="2.8" fill="white" fillOpacity="0.75" />

      {/* Shutter release. */}
      <circle cx="57" cy="32.5" r="2.4" fill="hsl(235 22% 90%)" />
    </DimensionalSvg>
  );
}
