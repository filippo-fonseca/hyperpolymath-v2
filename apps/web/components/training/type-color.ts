/**
 * Activity-type colour in the craft register (jul-29 restyle).
 *
 * `training_activity_types.color` is an OKLCH string the user picks from
 * `lib/training/palette.ts`. It is the type's identity, and the craft register
 * has one rule for identity colour: it runs saturated on borders, dots, icons
 * and other small accents, and it is softened almost to pastel before it is
 * ever allowed to become a fill.
 *
 * These helpers are the single place that softening happens, so every training
 * surface (cards, chips, month cells, stats rows) mixes the same way. They mix
 * against `--surface-raised` rather than `transparent` so a tinted plate stays
 * opaque on the raised white card underneath and reads identically in dark.
 *
 * Types have a colour of their own, so they never need `tintFor()`; entities
 * with no stored colour (batches, for instance) fall back to it instead.
 */

/** Pastel plate fill for a type — the 14% wash the craft register asks for. */
export function typeFill(color: string): string {
  return `color-mix(in srgb, ${color} 14%, var(--surface-raised))`;
}

/** A slightly deeper wash, for the hovered/active state of a tinted plate. */
export function typeFillStrong(color: string): string {
  return `color-mix(in srgb, ${color} 22%, var(--surface-raised))`;
}

/** Candy rim: the type's hue pulled toward the neutral edge so it stays a hairline. */
export function typeEdge(color: string): string {
  return `color-mix(in srgb, ${color} 45%, var(--edge))`;
}

/**
 * In-family ink for text/icons sitting on `typeFill()`. Darkened against the
 * page ink so a light palette colour (butter, mint) still reads as text.
 */
export function typeInk(color: string): string {
  return `color-mix(in srgb, ${color} 70%, var(--ink))`;
}
