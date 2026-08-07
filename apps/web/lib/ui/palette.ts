/**
 * The app's named colour tokens, for anything a user picks a colour FOR.
 *
 * Wiki folders and cover banners both needed "let me choose a colour", and the
 * answer to that has to be a fixed vocabulary rather than a hex field: a free
 * colour input produces values that fight the theme, read illegibly in dark
 * mode, and cannot be re-tuned later. These names map to the existing tint
 * ramp (`--tint-*`), so a folder painted "sage" stays right when the palette
 * moves and matches the pastel a habit or a task already wears.
 *
 * Values are stored as the bare token name (`"sage"`), never as a colour.
 */

export const PALETTE_TOKENS = [
  "rose",
  "peach",
  "butter",
  "sage",
  "mint",
  "sky",
  "lavender",
  "plum",
] as const;

export type PaletteToken = (typeof PALETTE_TOKENS)[number];

export const PALETTE_LABELS: Record<PaletteToken, string> = {
  rose: "Rose",
  peach: "Peach",
  butter: "Butter",
  sage: "Sage",
  mint: "Mint",
  sky: "Sky",
  lavender: "Lavender",
  plum: "Plum",
};

/**
 * The CSS custom properties each token resolves to. `bg` is the wash a surface
 * fills with; `edge` is the saturated version for a dot, a rim, or a swatch.
 * Both come from the tint ramp already defined in the global stylesheet, with
 * a hard fallback so a token that outlives its ramp entry degrades to neutral
 * rather than to `transparent`.
 */
export function paletteVars(token: PaletteToken): { bg: string; edge: string; ink: string } {
  return {
    bg: `var(--tint-${token}-bg, var(--surface))`,
    edge: `var(--tint-${token}-edge, var(--edge-strong))`,
    ink: `var(--tint-${token}-ink, var(--ink))`,
  };
}

/**
 * The `tint-*` class that sets the generic `--tint-bg/edge/ink` triple, for
 * hosts that would rather compose with `var(--tint-…)` than read the three
 * values (matches `tintFor()` in `lib/tint.ts`, just chosen rather than
 * hashed).
 */
export function paletteClass(token: PaletteToken): string {
  return `tint-${token}`;
}

/** Narrow an untrusted string (DB text column) to a token, or null. */
export function coercePaletteToken(value: string | null | undefined): PaletteToken | null {
  return (PALETTE_TOKENS as readonly string[]).includes(value ?? "")
    ? (value as PaletteToken)
    : null;
}
