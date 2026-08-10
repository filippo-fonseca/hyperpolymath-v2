/**
 * Craft design register — ported from apps/web/app/globals.css.
 * If a value here disagrees with the web CSS, the CSS wins and this file
 * is the bug. See apps/mobile/REBUILD.md for the full contract.
 */

export type Scheme = "light" | "dark";

export interface Palette {
  canvas: string;
  surface: string;
  surfaceRaised: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
  edge: string;
  edgeStrong: string;
  hover: string;
  selected: string;
  accent: string;
  amber: string;
  sage: string;
  coral: string;
  violet: string;
  blue: string;
}

export const palettes: Record<Scheme, Palette> = {
  light: {
    canvas: "#f9f5f0",
    surface: "#f3f0eb",
    surfaceRaised: "#ffffff",
    ink: "#36302c",
    inkMuted: "#78726d",
    inkFaint: "#98938f",
    edge: "#e5e3e1",
    edgeStrong: "#d8d5d2",
    hover: "#f0ede7",
    selected: "#ebe7e0",
    accent: "#277c99",
    amber: "#cd9130",
    sage: "#639564",
    coral: "#d95b56",
    violet: "#8c74cc",
    blue: "#4682cc",
  },
  dark: {
    canvas: "#15171a",
    surface: "#1e2124",
    surfaceRaised: "#272a2e",
    ink: "#d6d9dd",
    inkMuted: "#9da0a5",
    inkFaint: "#797c81",
    edge: "#2c2f33",
    edgeStrong: "#3a3d42",
    hover: "#232529",
    selected: "#2b2e32",
    accent: "#62b8d8",
    amber: "#d09945",
    sage: "#70a971",
    coral: "#e66e68",
    violet: "#9e88da",
    blue: "#6098de",
  },
};

/**
 * Font family names as registered by @expo-google-fonts (useFonts keys).
 * Space Grotesk is the app-wide sans; JetBrains Mono is for tabular
 * numerics and micro-labels; EB Garamond exists for the logotype ONLY.
 */
export const fonts = {
  sans: "SpaceGrotesk_400Regular",
  sansMedium: "SpaceGrotesk_500Medium",
  sansSemiBold: "SpaceGrotesk_600SemiBold",
  sansBold: "SpaceGrotesk_700Bold",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
  logotype: "EBGaramond_600SemiBold",
} as const;

export type FontToken = keyof typeof fonts;

export interface TypeStep {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
}

/** display 30/1.2, title 20/1.35, subtitle 16/1.45, body 14.5/1.6, meta 13/1.5, micro 11.5/1.4 */
export const type: Record<
  "display" | "title" | "subtitle" | "body" | "meta" | "micro",
  TypeStep
> = {
  display: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontSize: 20, lineHeight: 27, letterSpacing: -0.2 },
  subtitle: { fontSize: 16, lineHeight: 23, letterSpacing: 0 },
  body: { fontSize: 14.5, lineHeight: 23, letterSpacing: 0 },
  meta: { fontSize: 13, lineHeight: 19.5, letterSpacing: 0 },
  micro: { fontSize: 11.5, lineHeight: 16, letterSpacing: 0 },
};

export type TypeVariant = keyof typeof type;

/** 6 menu rows · 8 tiles/icon buttons · 10 buttons/inset sub-cards · 12 panels · 14 cards · 20 sheets · pill */
export const radius = {
  row: 6,
  tile: 8,
  btn: 10,
  panel: 12,
  card: 14,
  sheet: 20,
  pill: 999,
} as const;

export interface ShadowPreset {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
}

/** Warm-black shadows in light so they stay in the cream family; true black in dark. */
export const shadows: Record<Scheme, Record<"card" | "float" | "pop", ShadowPreset>> = {
  light: {
    card: {
      shadowColor: "rgb(50,40,25)",
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    float: {
      shadowColor: "rgb(50,40,25)",
      shadowOpacity: 0.09,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    pop: {
      shadowColor: "rgb(50,40,25)",
      shadowOpacity: 0.18,
      shadowRadius: 44,
      shadowOffset: { width: 0, height: 16 },
      elevation: 12,
    },
  },
  dark: {
    card: {
      shadowColor: "#000000",
      shadowOpacity: 0.32,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    float: {
      shadowColor: "#000000",
      shadowOpacity: 0.4,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    pop: {
      shadowColor: "#000000",
      shadowOpacity: 0.55,
      shadowRadius: 44,
      shadowOffset: { width: 0, height: 16 },
      elevation: 12,
    },
  },
};

/**
 * Motion law. Entrances 160–220ms ease-out-quart; collapses 200–320ms;
 * micro color 120–150ms; press 100ms. Nothing under 100ms or over 320ms.
 * Animate opacity/transform only.
 */
export const motion = {
  duration: {
    press: 100,
    micro: 140,
    enter: 200,
    panel: 260,
    collapse: 280,
  },
  /** cubic-bezier control points — feed to Reanimated's Easing.bezier(...) */
  bezier: {
    easeOutQuart: [0.25, 1, 0.5, 1] as const,
    collapse: [0.32, 0.72, 0, 1] as const,
    softLanding: [0.23, 1, 0.32, 1] as const,
    outBack: [0.34, 1.56, 0.64, 1] as const,
  },
} as const;
