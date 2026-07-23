/**
 * theme.ts — the TypeScript face of the sd design vocabulary for mobile.
 *
 * MIRRORED from apps/desktop/src/styles/sd-tokens.css (and studio/tokens.ts),
 * which themselves mirror apps/web/app/globals.css. If a value here disagrees
 * with the desktop CSS, the CSS wins and this file is the bug.
 *
 * React Native cannot read CSS custom properties, so literals live here.
 * oklch is converted to hex/rgba where RN support is unreliable; hsl surfaces
 * match desktop verbatim (RN 0.85 accepts modern hsl()).
 *
 * DARK ONLY — same sealed decision D2 as apps/desktop: JARVIS is an instrument
 * panel. No parchment light ladder.
 *
 * Legacy aliases (`colors`, `mono`, `serif*`) keep existing screens compiling
 * while units restyle onto the sd names. Prefer `sd.*` / `font.*` in new code.
 */

/** The one accent — web --hud-cyan as sRGB (oklch 72% 0.13 210 ≈ #22d3ee). */
export const SD_ACCENT = "#22d3ee";
export const SD_ACCENT_FAINT = "#5bdef2"; // oklch 78% 0.16 210 approx
export const SD_ACCENT_DEEP = "#0e9bb8"; // oklch 58% 0.1 210 approx
export const SD_ACCENT_RGB = "34, 211, 238" as const;

/** Ink ladder — mirrors `--sd-ink*` */
export const SD_INK = {
  base: "hsl(235, 35%, 92%)",
  dull: "hsl(235, 10%, 70%)",
  faint: "hsl(235, 10%, 55%)",
} as const;

/** Surface ladder — mirrors `--sd-app/box/...` verbatim (comma form for RN). */
export const SD_SURFACES = {
  darkerBox: "hsl(235, 16%, 11%)",
  app: "hsl(235, 15%, 13%)",
  darkBox: "hsl(235, 15%, 15%)",
  box: "hsl(235, 15%, 18%)",
  input: "hsl(235, 15%, 20%)",
  line: "hsl(235, 15%, 23%)",
  divider: "hsl(235, 15%, 5%)",
  hover: "hsl(235, 15%, 25%)",
  selected: "hsl(235, 15%, 26%)",
  active: "hsl(235, 15%, 30%)",
  menu: "hsl(235, 15%, 10%)",
  frame: "hsl(235, 15%, 25%)",
  sidebar: "hsl(235, 16%, 11%)",
} as const;

/** Functional inks — sage = active, amber = warn, coral = error. */
export const SD_FUNCTIONAL = {
  amber: "#e5a84b", // oklch 70% 0.13 75 approx
  sage: "#6fa87a", // oklch 62% 0.09 145 approx
  coral: "#e06b5c", // oklch 63% 0.16 25 approx
} as const;

/** Radius ladder (§5). 14 is card v2 alone. */
export const SD_RADIUS = {
  chip: 4,
  chrome: 6,
  tile: 8,
  pillInset: 10,
  panel: 12,
  card: 14,
  full: 9999,
} as const;

/** Tracking (§3). */
export const SD_TRACK = {
  tight: -0.01,
  caps: 0.8, // em → StyleSheet letterSpacing is in px-ish; use 0.8 for ~0.08em at 10px
  monoEyebrow: 1.0,
} as const;

/**
 * Expo font family keys (loaded in App.tsx via @expo-google-fonts).
 * Space Grotesk is the app-wide sans. JetBrains Mono is micro-labels only.
 * EB Garamond is logotype-only (§3 / §16).
 */
export const font = {
  sans: "SpaceGrotesk_400Regular",
  sansMedium: "SpaceGrotesk_500Medium",
  sansSemiBold: "SpaceGrotesk_600SemiBold",
  sansBold: "SpaceGrotesk_700Bold",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
  logotype: "EBGaramond_600SemiBold",
} as const;

/** Convenience bag for StyleSheet consumers. */
export const sd = {
  accent: SD_ACCENT,
  accentFaint: SD_ACCENT_FAINT,
  accentDeep: SD_ACCENT_DEEP,
  ink: SD_INK.base,
  inkDull: SD_INK.dull,
  inkFaint: SD_INK.faint,
  app: SD_SURFACES.app,
  box: SD_SURFACES.box,
  darkBox: SD_SURFACES.darkBox,
  darkerBox: SD_SURFACES.darkerBox,
  input: SD_SURFACES.input,
  line: SD_SURFACES.line,
  selected: SD_SURFACES.selected,
  hover: SD_SURFACES.hover,
  amber: SD_FUNCTIONAL.amber,
  sage: SD_FUNCTIONAL.sage,
  coral: SD_FUNCTIONAL.coral,
  radius: SD_RADIUS,
} as const;

// ---------------------------------------------------------------------------
// Legacy aliases — bridge for pre-sd screens. Prefer `sd` / `font` in new code.
// ---------------------------------------------------------------------------

export const colors = {
  bg: SD_SURFACES.app,
  surface: SD_SURFACES.box,
  border: SD_SURFACES.line,
  hairline: "rgba(255, 255, 255, 0.09)",
  text: SD_INK.base,
  textDim: SD_INK.dull,
  accent: SD_ACCENT,
  rec: SD_FUNCTIONAL.coral,
  upload: SD_FUNCTIONAL.amber,
  danger: SD_FUNCTIONAL.coral,
} as const;

/** @deprecated Use `font.mono` — Menlo was the pre-sd HUD mono. */
export const mono = font.mono;
/** @deprecated Use `font.sans` — serif is banned outside the logotype. */
export const serif = font.sans;
/** @deprecated Use `font.sansMedium`. */
export const serifMedium = font.sansMedium;
/** @deprecated Use `font.sansSemiBold`. */
export const serifSemiBold = font.sansSemiBold;
