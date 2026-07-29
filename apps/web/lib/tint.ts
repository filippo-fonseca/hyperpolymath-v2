/**
 * Deterministic pastel tint assignment (jul-29 craft restyle).
 *
 * Maps any stable key (an entity id, a hashtag, a name) onto one of the eight
 * craft tint classes defined in globals.css. The class sets the generic
 * --tint-bg / --tint-edge / --tint-ink triple on the element, so consumers
 * style with `var(--tint-…)` and stay hue-agnostic.
 *
 * Same key → same hue, every render, both themes. No storage, no migration.
 */

export const TINT_CLASSES = [
  "tint-rose",
  "tint-peach",
  "tint-butter",
  "tint-sage",
  "tint-mint",
  "tint-sky",
  "tint-lavender",
  "tint-plum",
] as const;

export type TintClass = (typeof TINT_CLASSES)[number];

export function tintFor(key: string): TintClass {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return TINT_CLASSES[hash % TINT_CLASSES.length];
}
