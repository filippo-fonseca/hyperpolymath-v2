/**
 * Shared glassy-pill tile chrome for /insights surfaces.
 *
 * Matches the PROFILE pill in `SettingsSectionNav` — translucent surface
 * (color-mixed against transparent), backdrop blur, hairline cyan-tinged
 * border, inset white highlight + inset cyan glow, plus a soft outer
 * halo. Hover deepens the cyan border, intensifies the inset glow, and
 * lifts the outer halo for a tactile pop.
 *
 * `NEUMORPHIC_TILE` is name-preserved for callsite stability but the
 * recipe is no longer neumorphic. It owns the glassy shell (rounded
 * corner, blur, surface, border, layered shadows, transitions) but
 * not its own padding so chart panels can compose it.
 * `NEUMORPHIC_TILE_PADDED` adds the canonical `p-6 space-y-4` rhythm
 * used by stat / summary tiles.
 *
 * For panels that want to layer a brand halo on top (life/* panels with
 * `--panel-accent`), use `glassyTileShadow({ withPanelAccentHalo: true })`
 * to compose a single `box-shadow` string that combines the glassy
 * recipe with an additional outer halo tinted by `--panel-accent`. Apply
 * it via inline `style={{ boxShadow: ... }}` alongside the
 * `NEUMORPHIC_TILE` className (the inline shadow takes precedence).
 */
export const NEUMORPHIC_TILE =
  "rounded-xl backdrop-blur-md " +
  "bg-[color-mix(in_oklch,var(--surface)_82%,transparent)] " +
  "border border-[color-mix(in_oklch,var(--edge)_55%,transparent)] " +
  "shadow-[inset_0_1px_0_color-mix(in_oklch,white_12%,transparent),inset_0_-1px_0_color-mix(in_oklch,var(--ink)_10%,transparent),inset_0_0_24px_color-mix(in_oklch,var(--hud-cyan)_6%,transparent),0_10px_32px_color-mix(in_oklch,var(--ink)_22%,transparent),0_2px_6px_color-mix(in_oklch,var(--ink)_10%,transparent)] " +
  "hover:border-[color-mix(in_oklch,var(--hud-cyan)_45%,transparent)] " +
  "hover:shadow-[inset_0_1px_0_color-mix(in_oklch,white_16%,transparent),inset_0_-1px_0_color-mix(in_oklch,var(--ink)_12%,transparent),inset_0_0_32px_color-mix(in_oklch,var(--hud-cyan)_12%,transparent),0_14px_40px_color-mix(in_oklch,var(--ink)_30%,transparent),0_2px_8px_color-mix(in_oklch,var(--ink)_14%,transparent)] " +
  "transition-[border-color,box-shadow,background-color] duration-200 ease-out";

export const NEUMORPHIC_TILE_PADDED = `p-6 space-y-4 ${NEUMORPHIC_TILE}`;

/**
 * Compose the glassy box-shadow as an inline style string, optionally with
 * an additional outer halo tinted by `--panel-accent` for `life/*` panels.
 * Use this when you need to layer a brand color halo on top of the glassy
 * recipe — pass via `style={{ boxShadow: glassyTileShadow({ withPanelAccentHalo: true }) }}`.
 *
 * The panel-accent halo is composed AFTER the glassy halos so it reads as
 * a brand-colored bloom around the otherwise-cyan-tinged tile.
 */
export function glassyTileShadow(
  opts: { withPanelAccentHalo?: boolean; hover?: boolean } = {},
): string {
  const { withPanelAccentHalo = false, hover = false } = opts;
  const insetHi = hover ? 16 : 12;
  const insetLo = hover ? 12 : 10;
  const insetCyan = hover ? 32 : 24;
  const insetCyanPct = hover ? 12 : 6;
  const dropMain = hover ? "0 14px 40px" : "0 10px 32px";
  const dropMainPct = hover ? 30 : 22;
  const dropFine = hover ? "0 2px 8px" : "0 2px 6px";
  const dropFinePct = hover ? 14 : 10;

  const glassy =
    `inset 0 1px 0 color-mix(in oklch, white ${insetHi}%, transparent), ` +
    `inset 0 -1px 0 color-mix(in oklch, var(--ink) ${insetLo}%, transparent), ` +
    `inset 0 0 ${insetCyan}px color-mix(in oklch, var(--hud-cyan) ${insetCyanPct}%, transparent), ` +
    `${dropMain} color-mix(in oklch, var(--ink) ${dropMainPct}%, transparent), ` +
    `${dropFine} color-mix(in oklch, var(--ink) ${dropFinePct}%, transparent)`;

  if (!withPanelAccentHalo) return glassy;

  const haloPct = hover ? 10 : 6;
  const haloSize = hover ? 40 : 32;
  return `${glassy}, 0 0 ${haloSize}px color-mix(in oklch, var(--panel-accent) ${haloPct}%, transparent)`;
}
