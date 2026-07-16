import {
  BodyGradient,
  DimensionalSvg,
  type DimensionalIconProps,
  FaceGradient,
  ICON_CREASE,
  SheenGradient,
  useIconIds,
} from "@/components/ui/icons/shared";

/**
 * Apple on a rounded tile — the nutrition/food motif.
 *
 * Lives in the nutrition fence rather than `components/ui/icons` (that family
 * belongs to unit-primitives). It CONSUMES the shared dimensional recipe
 * (`DimensionalSvg` + the indigo `BodyGradient`/`FaceGradient`/`SheenGradient`)
 * so it reads identically to HabitIcon/TrainingIcon in both themes: cool-indigo
 * body material, token-driven drop shadow, accent only in the drop frame.
 */
export function NutritionIcon({
  size = 40,
  dropTarget = false,
  className,
  title,
}: DimensionalIconProps) {
  const id = useIconIds("nutrition");

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
          <FaceGradient id={id.face} x1={30} y1={34} x2={50} y2={58} />
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
      {/* apple body — two lobes meeting at a top dip */}
      <path
        d="M40 39C36.4 34.2 30.6 34.2 28 39.4C25.4 44.6 27.8 54 33.4 56.2C36.2 57.4 38.4 56.4 40 56.4C41.6 56.4 43.8 57.4 46.6 56.2C52.2 54 54.6 44.6 52 39.4C49.4 34.2 43.6 34.2 40 39Z"
        fill={`url(#${id.face})`}
      />
      {/* top-dip crease so the two lobes read as extruded */}
      <path
        d="M40 39.4C39 41 37 41.4 35.4 40.6"
        stroke={ICON_CREASE}
        strokeOpacity="0.32"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* stem */}
      <path
        d="M40 38.2V31.4"
        stroke={ICON_CREASE}
        strokeOpacity="0.5"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* leaf */}
      <path
        d="M41 32.6C43.6 28.6 48.4 29 50.4 31.6C47.4 35 43 34.6 41 32.6Z"
        fill="hsl(235 22% 88%)"
      />
    </DimensionalSvg>
  );
}
