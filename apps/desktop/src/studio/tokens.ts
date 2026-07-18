/**
 * tokens.ts — the TypeScript face of the sd design vocabulary.
 *
 * `src/styles/sd-tokens.css` is the SOURCE OF TRUTH. It has to be, because the
 * HUD substrate is a pure `<style>` block inside index.html and cannot import
 * TypeScript. This file mirrors those same values for the Studio's ~200 inline
 * `style={{}}` sites, which cannot read a stylesheet's custom properties without
 * a `var()` round-trip. Two faces, one ladder. If they ever disagree, the CSS
 * wins and this file is the bug.
 *
 * Prefer `var(--sd-*)` in anything that lands in a stylesheet or a `style={{}}`
 * on an element inside the token scope; reach for these constants when you need
 * the literal (canvas painting, computed geometry, motion configs).
 *
 * ADDITIVE. Every export that existed before this rewrite still exists, because
 * files in other units' fences import them and this unit is not allowed to touch
 * those files. Legacy names are aliased onto the sd ladder, never deleted.
 */

/* --- The one accent -------------------------------------------------------
 * Two accents disagreed before this file: index.html's `--accent` (#00d4ff) and
 * this file's `jarvisCyan` (#2FA8FF). The contract mandates ONE, and it is the
 * web's sd accent — `--hud-cyan`, mirrored from apps/web/app/globals.css. Every
 * accent name below now resolves here, so a consumer cannot pick the wrong one.
 */
export const SD_ACCENT = "oklch(72% 0.13 210)";
export const SD_ACCENT_FAINT = "oklch(78% 0.16 210)";
export const SD_ACCENT_DEEP = "oklch(58% 0.1 210)";

/** Ink ladder — mirrors `--sd-ink*` (globals.css `.wiki-explorer`). */
export const SD_INK = {
  base: "hsl(235 35% 92%)",
  dull: "hsl(235 10% 70%)",
  faint: "hsl(235 10% 55%)",
} as const;

/**
 * Surface ladder — mirrors `--sd-app/box/dark-box/darker-box/...` verbatim.
 * Depth reads through ~4-5% lightness steps on one hue plus hairline borders,
 * never heavy shadows. Ordered recessed → raised.
 */
export const SD_SURFACES = {
  darkerBox: "hsl(235 16% 11%)",
  app: "hsl(235 15% 13%)",
  darkBox: "hsl(235 15% 15%)",
  box: "hsl(235 15% 18%)",
  input: "hsl(235 15% 20%)",
  line: "hsl(235 15% 23%)",
  divider: "hsl(235 15% 5%)",
  hover: "hsl(235 15% 25%)",
  selected: "hsl(235 15% 26%)",
  active: "hsl(235 15% 30%)",
  menu: "hsl(235 15% 10%)",
  frame: "hsl(235 15% 25%)",
} as const;

/** Functional inks (§D6) — sage = active, accent = synced, amber = warn, coral = error. */
export const SD_FUNCTIONAL = {
  amber: "oklch(70% 0.13 75)",
  sage: "oklch(62% 0.09 145)",
  coral: "oklch(63% 0.16 25)",
} as const;

/** Radius ladder (§5). 14px is card v2's alone — do not round anything else to it. */
export const SD_RADIUS = {
  chip: 4,
  chrome: 6,
  tile: 8,
  pillInset: 10,
  panel: 12,
  card: 14,
  full: 9999,
} as const;

/** Hairline elevation (§5): a 1px line border plus a white inset top hairline. */
export const SD_HAIRLINE = {
  panel: "rgba(255, 255, 255, 0.15) 0 1px 0 inset",
  card: "rgba(255, 255, 255, 0.09) 0 1px 0 inset",
} as const;

/** Font stacks. Faces are vendored + declared in `src/styles/sd-fonts.css`. */
export const SD_FONT = {
  sans: '"Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  /* Berkeley Mono stays ahead of JetBrains: it is the existing local-first
     preference, and users who have it installed keep it. */
  mono: '"Berkeley Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

/** Motion (§14). Durations in ms; the session clamp is 120-160ms on opacity/transform. */
export const SD_DURATION = {
  tab: 80,
  press: 100,
  micro: 150,
  entrance: 160,
  collapse: 240,
} as const;

/** Color-only subset of the Studiolo material palette for the desktop DOM HUD. */
export const STUDIOLO = {
  nightwalnut: "#120E0B",
  deepVellum: "#0E1420",
  parchment: "#F2E9D8",
  sepiaInk: "#4A3B2A",
  brass: "#C9A227",
  candleflame: "#E8C46B",
  emberAlarm: "#FF6B4A",
  /* Reconciled: both cyan materials now resolve to the one sd accent instead of
     the old #2FA8FF / #3BD6FF pair. Kept as names so existing consumers compile. */
  jarvisCyan: SD_ACCENT,
  fireflyCyan: SD_ACCENT_FAINT,
  verdigris: "#4FA487",
  moonlace: "#8FA8C7",
} as const;

export type StudioloToken = keyof typeof STUDIOLO;

/**
 * Constellation node colours, feeding the ambient node-graph background.
 *
 * These six hues are living on borrowed time: oracle ruling O3 collapses them to
 * the single accent, because the constellation is atmosphere rather than data
 * encoding, so §21's chart exemption does not cover it and §1's single-hue rule
 * applies. O3 assigns that collapse to UNIT 4, which owns `ConstellationCanvas`
 * and can screenshot the result — so the hues stay untouched here and no pixel
 * moves in this unit. Unit 4: swap these for `SD_ACCENT`.
 */
export const NODE_PALETTE = [
  "oklch(72% 0.13 210)",
  "oklch(74% 0.14 350)",
  "oklch(72% 0.14 305)",
  "oklch(74% 0.13 175)",
  "oklch(76% 0.15 155)",
  "oklch(80% 0.13 70)",
] as const;

export const HUD_COLORS = {
  canvas: "#05070D",
  canvasRaised: "#0A0E1A",
  grid: "rgba(59, 214, 255, 0.09)",
  rule: "rgba(47, 168, 255, 0.24)",
  accent: STUDIOLO.jarvisCyan,
  accentHigh: STUDIOLO.fireflyCyan,
  text: "#DCE8EE",
  muted: "#687C8F",
} as const;

/**
 * Surface ladder — near-equal navy steps on one hue (mirroring the wiki's
 * Spacedrive `--sd-box`/`-dark-box`/`-darker-box` idiom). Depth reads through
 * ~4-5% lightness steps + hairline borders, never heavy shadows. Ordered
 * recessed → raised: `sunken` (drawer/inputs) < `base` (body) < `raised`
 * (headers/chrome) < `hover` (interactive hover rung).
 *
 * This was the seed the sd ladder grew from; `SD_SURFACES` above is the real
 * thing. These literals are deliberately left as-is so no pixel moves in this
 * unit — units 4-6 migrate their own fences onto `SD_SURFACES` / `var(--sd-*)`
 * and take the screenshot that proves it.
 */
export const HUD_SURFACES = {
  sunken: "#080B14",
  base: "#0A0E1A",
  raised: "#0E1322",
  hover: "#141A2C",
  line: "rgba(47, 168, 255, 0.24)",
  lineStrong: "rgba(47, 168, 255, 0.40)",
} as const;

/** One calibrated easing curve (matches the wiki `--ease-out-quart`) for HUD motion. */
export const HUD_EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;

// Widget-layer palette, expressed against the canonical HUD palette above.
export const STUDIO_COLORS = {
  background: HUD_COLORS.canvas,
  surface: HUD_COLORS.canvasRaised,
  text: HUD_COLORS.text,
  muted: HUD_COLORS.muted,
  rule: HUD_COLORS.rule,
  accent: STUDIOLO.jarvisCyan,
  danger: STUDIOLO.emberAlarm,
  shadow: "#020305",
} as const;

export const STUDIO_MONO = SD_FONT.mono;
