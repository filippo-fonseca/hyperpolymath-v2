/**
 * Shared tile chrome for /insights surfaces, riding the global glass surface
 * system (`.glass-tile` in globals.css). Strength knobs live in the
 * --glass-* CSS variables — tune there, not here.
 *
 * `NEUMORPHIC_TILE` is name-preserved for callsite stability.
 *
 * For panels that want a brand halo on top (life/* panels with
 * `--panel-accent`), use `glassyTileShadow({ withPanelAccentHalo: true })`
 * via inline `style={{ boxShadow: ... }}`. It restates the glass stack from
 * the same knob vars (inline shadows clobber class shadows, so the stack
 * must be self-contained) and appends the accent-tinted bloom.
 */
export const NEUMORPHIC_TILE = "rounded-xl glass-tile";

export const NEUMORPHIC_TILE_PADDED = `p-6 space-y-4 ${NEUMORPHIC_TILE}`;

export function glassyTileShadow(
  opts: { withPanelAccentHalo?: boolean } = {},
): string {
  const glass =
    "var(--glass-raise), var(--glass-drop), " +
    "inset 0 1px 0 var(--glass-hi), " +
    "inset 0 -1px 0 var(--glass-lo), " +
    "inset 0 0 24px color-mix(in oklch, var(--glass-glow-color) var(--glass-glow), transparent)";

  if (!opts.withPanelAccentHalo) return glass;

  return `${glass}, 0 0 32px color-mix(in oklch, var(--panel-accent) 6%, transparent)`;
}
