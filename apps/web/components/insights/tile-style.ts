/**
 * Shared neumorphic glassy tile chrome for /insights surfaces.
 *
 * Matches the "soft pillow" look shipped on /settings — rounded-xl shell,
 * dual-direction paired shadow (dark bottom-right, light top-left), an inset
 * white highlight that gives the surface a glassy bevel, and a hover state
 * that deepens both shadows and swaps the border to --edge-hud.
 *
 * `NEUMORPHIC_TILE` keeps the rounded corner + edge + shadow vocabulary but
 * skips `p-6 space-y-4` so chart panels (which manage their own padding) can
 * compose it. `NEUMORPHIC_TILE_PADDED` adds the canonical padding for stat /
 * summary tiles that follow the /settings spacing rhythm.
 */
export const NEUMORPHIC_TILE =
  "rounded-xl border border-[color-mix(in_oklch,var(--edge)_70%,transparent)] " +
  "shadow-[6px_6px_18px_color-mix(in_oklch,var(--ink)_8%,transparent),-4px_-4px_14px_color-mix(in_oklch,var(--surface)_70%,white),inset_0_1px_0_color-mix(in_oklch,white_60%,transparent)] " +
  "hover:border-[var(--edge-hud)] hover:shadow-[8px_8px_22px_color-mix(in_oklch,var(--ink)_12%,transparent),-5px_-5px_16px_color-mix(in_oklch,var(--surface)_70%,white),inset_0_1px_0_color-mix(in_oklch,white_60%,transparent)] " +
  "transition-[border-color,box-shadow] duration-200 ease-out";

export const NEUMORPHIC_TILE_PADDED = `p-6 space-y-4 ${NEUMORPHIC_TILE}`;
