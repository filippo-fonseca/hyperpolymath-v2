/**
 * Shared tile chrome for /insights surfaces — craft register (jul-29 restyle).
 *
 * `NEUMORPHIC_TILE` is name-preserved for call-site stability: every insights
 * consumer restyles for free. It is now the craft card plate — `.craft-card`
 * (raised `--surface-raised` fill, one hairline, the soft `--shadow-card`
 * ladder) plus the 14px card radius.
 *
 * `.craft-card` is UNLAYERED CSS, so it beats Tailwind `bg-*` / `border-*`
 * utilities on the same element. Never pair a background utility with these
 * constants — pad and lay out with utilities only.
 *
 * `INSIGHTS_PANEL` is the same plate at the 20px large-panel radius, for the
 * full-width LIFE panels (GitHub / Strava / Flow) that read as panels rather
 * than cards.
 *
 * `glassyTileShadow` is kept for API stability only. The neumorphic glow stack
 * is long retired and the craft plate now owns its own elevation, so this
 * returns the card shadow verbatim rather than a bloom. New code should not
 * call it: let `.craft-card` paint the shadow.
 */
export const NEUMORPHIC_TILE = "craft-card rounded-xl";

export const NEUMORPHIC_TILE_PADDED = `p-6 space-y-4 ${NEUMORPHIC_TILE}`;

/** Large-panel variant — same plate, 20px radius (craft register). */
export const INSIGHTS_PANEL = "craft-card rounded-2xl";

export function glassyTileShadow(
  _opts: { withPanelAccentHalo?: boolean } = {},
): string {
  // Glow/halo retired. The craft plate's elevation is the shadow ladder.
  return "var(--shadow-card)";
}
