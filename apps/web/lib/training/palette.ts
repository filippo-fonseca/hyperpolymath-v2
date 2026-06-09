/**
 * Curated 16-color OKLCH palette for the Training surface (Phase 15).
 *
 * Hues span the full circle in roughly 22.5° steps, skipping muddy zones
 * (~60° yellow-brown, ~270° dim purple). Lightness ~60–72%, chroma ~0.09–0.16
 * — tuned to harmonize with the app's existing `--ink-*` and `--hud-cyan*`
 * tokens (see `apps/web/app/globals.css`). Two low-chroma neutrals (Slate,
 * Graphite) round out the set for "rest/recovery" type activities.
 *
 * The palette is the single source of truth for the activity-type color
 * picker (`ColorPicker.tsx`) and is referenced from the OKLCH heatmap
 * blend math (`color-blend.ts`).
 */

export interface PaletteEntry {
  id: string;
  name: string;
  oklch: string;
}

export const TRAINING_PALETTE: ReadonlyArray<PaletteEntry> = [
  { id: "ember",    name: "Ember",    oklch: "oklch(65% 0.16 25)" },   // warm red
  { id: "coral",    name: "Coral",    oklch: "oklch(70% 0.15 45)" },
  { id: "amber",    name: "Amber",    oklch: "oklch(72% 0.13 75)" },   // matches --ink-amber
  { id: "ochre",    name: "Ochre",    oklch: "oklch(68% 0.12 95)" },
  { id: "moss",     name: "Moss",     oklch: "oklch(65% 0.11 130)" },
  { id: "sage",     name: "Sage",     oklch: "oklch(62% 0.09 145)" },  // matches --ink-sage
  { id: "fern",     name: "Fern",     oklch: "oklch(60% 0.12 160)" },
  { id: "teal",     name: "Teal",     oklch: "oklch(65% 0.12 190)" },
  { id: "cyan",     name: "Cyan",     oklch: "oklch(72% 0.13 210)" },  // matches --hud-cyan
  { id: "azure",    name: "Azure",    oklch: "oklch(65% 0.14 230)" },
  { id: "indigo",   name: "Indigo",   oklch: "oklch(58% 0.15 265)" },
  { id: "violet",   name: "Violet",   oklch: "oklch(60% 0.16 290)" },
  { id: "plum",     name: "Plum",     oklch: "oklch(58% 0.14 320)" },
  { id: "rose",     name: "Rose",     oklch: "oklch(65% 0.15 350)" },
  { id: "slate",    name: "Slate",    oklch: "oklch(60% 0.03 240)" },  // low-chroma neutral
  { id: "graphite", name: "Graphite", oklch: "oklch(55% 0.02 60)" },
];

/** Muted token used for heatmap cells with zero activities (D-12). */
export const EMPTY_DAY_COLOR = "var(--surface)";

/** Default fallback when a new type is created without a chosen color. */
export const DEFAULT_PALETTE_ID = "cyan";

export function paletteById(id: string): PaletteEntry | undefined {
  return TRAINING_PALETTE.find((p) => p.id === id);
}
