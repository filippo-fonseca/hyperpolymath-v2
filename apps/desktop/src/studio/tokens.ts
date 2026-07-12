/** Color-only subset of the Studiolo material palette for the desktop DOM HUD. */
export const STUDIOLO = {
  nightwalnut: "#120E0B",
  deepVellum: "#0E1420",
  parchment: "#F2E9D8",
  sepiaInk: "#4A3B2A",
  brass: "#C9A227",
  candleflame: "#E8C46B",
  emberAlarm: "#FF6B4A",
  jarvisCyan: "#2FA8FF",
  fireflyCyan: "#3BD6FF",
  verdigris: "#4FA487",
  moonlace: "#8FA8C7",
} as const;

export type StudioloToken = keyof typeof STUDIOLO;

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

export const STUDIO_MONO =
  '"Berkeley Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
