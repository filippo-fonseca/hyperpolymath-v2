/**
 * The 8-hue pastel tint ramp, ported from apps/web (lib/tint.ts +
 * lib/ui/palette.ts + globals.css .tint-* classes). Same key → same hue,
 * forever, both schemes. Folder colors are stored in the DB as bare token
 * names ("sage"), never hex.
 */

import type { Scheme } from "./tokens";

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

export interface Tint {
  bg: string;
  edge: string;
  ink: string;
}

export const tints: Record<Scheme, Record<PaletteToken, Tint>> = {
  light: {
    rose: { bg: "#ffebec", edge: "#ec8a92", ink: "#923240" },
    peach: { bg: "#ffeee2", edge: "#e79e6b", ink: "#85491a" },
    butter: { bg: "#fbf4da", edge: "#d4bd67", ink: "#6e580f" },
    sage: { bg: "#e9f6e6", edge: "#89bb7e", ink: "#365e2d" },
    mint: { bg: "#e0f7f1", edge: "#63baa8", ink: "#005e50" },
    sky: { bg: "#e5f4fd", edge: "#61afda", ink: "#005a81" },
    lavender: { bg: "#efefff", edge: "#9d9be7", ink: "#504994" },
    plum: { bg: "#faebf8", edge: "#cf8ec9", ink: "#793974" },
  },
  dark: {
    rose: { bg: "#382425", edge: "#9e4b54", ink: "#e9bec0" },
    peach: { bg: "#36261c", edge: "#9b5e30", ink: "#e9c6af" },
    butter: { bg: "#2f2a17", edge: "#857430", ink: "#dbd1ad" },
    sage: { bg: "#232e20", edge: "#4f7945", ink: "#bdd6b8" },
    mint: { bg: "#1c2e2a", edge: "#2c7b6c", ink: "#acd9ce" },
    sky: { bg: "#1d2c35", edge: "#31779b", ink: "#b5d3e5" },
    lavender: { bg: "#282839", edge: "#6c68a9", ink: "#cacaee" },
    plum: { bg: "#332531", edge: "#8f588a", ink: "#e1c3de" },
  },
};

/** Same hash as web lib/tint.ts: hash = hash*31 + charCode, unsigned. */
export function tintTokenFor(key: string): PaletteToken {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PALETTE_TOKENS[hash % PALETTE_TOKENS.length];
}

/** Stable hashed tint for an entity id, resolved for the active scheme. */
export function tintFor(key: string, scheme: Scheme): Tint {
  return tints[scheme][tintTokenFor(key)];
}

/** Narrow an untrusted DB string ("sage") to a palette token, else null. */
export function coercePaletteToken(value: string | null | undefined): PaletteToken | null {
  if (!value) return null;
  return (PALETTE_TOKENS as readonly string[]).includes(value)
    ? (value as PaletteToken)
    : null;
}

/**
 * Resolve an entity's tint: its chosen palette token when valid, else the
 * stable hashed hue for its id — mirrors web folder painting exactly.
 */
export function entityTint(
  id: string,
  chosen: string | null | undefined,
  scheme: Scheme,
): Tint {
  const token = coercePaletteToken(chosen);
  return token ? tints[scheme][token] : tintFor(id, scheme);
}
