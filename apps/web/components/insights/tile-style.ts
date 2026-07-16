/**
 * Shared tile chrome for /insights surfaces, in the sd register (sesh-sd3).
 *
 * `NEUMORPHIC_TILE` is name-preserved for call-site stability: every insights
 * consumer restyles for free. It is now the WidgetCard v2 plate — a solid
 * `--sd-box` fill, 1px `--sd-line` hairline, 14px radius. No glass, no blur,
 * no glow.
 *
 * `glassyTileShadow` is kept for API stability but the glow/neumorphic stack
 * is retired: it returns `none` so no consumer paints a bloom. The plate's
 * elevation comes from the grey ladder + hairline alone (DESIGN-SYSTEM §9).
 */
export const NEUMORPHIC_TILE =
  "rounded-[14px] bg-[var(--sd-box)] border border-[var(--sd-line)]";

export const NEUMORPHIC_TILE_PADDED = `p-6 space-y-4 ${NEUMORPHIC_TILE}`;

export function glassyTileShadow(
  _opts: { withPanelAccentHalo?: boolean } = {},
): string {
  // Glow/halo retired (§16 banned). Flat sd plate: elevation via border + bg.
  return "none";
}
