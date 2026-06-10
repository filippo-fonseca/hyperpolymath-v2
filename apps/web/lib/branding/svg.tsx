/**
 * Brand asset generators.
 *
 * Each asset is described twice:
 *   - `renderSvg(theme)` → SVG markup string (downloadable, vector-faithful).
 *     Text-bearing SVGs embed EB Garamond as base64 woff2 in a `<style>`
 *     block so the file renders identically wherever it's opened (Figma,
 *     browsers, Illustrator).
 *   - `renderJsx(theme)` → React tree consumed by `next/og`'s ImageResponse
 *     to produce the PNG counterpart. The JSX layout mirrors the SVG so
 *     PNG and SVG downloads stay visually identical.
 *
 * Shared geometry constants live at module scope so the two renderers
 * never drift.
 */

import type { ReactElement } from "react";
import { loadEbGaramond } from "@/lib/og/fonts";

/* ──────────────────────────────────────────────────────────────────────────
   Theme palette
   ────────────────────────────────────────────────────────────────────────── */

export type ThemeKey = "paper" | "dark" | "hud";

export const THEMES: Record<
  ThemeKey,
  {
    bg: string;
    fg: string;
    muted: string;
    accent: string;
    rule: string;
    glow: string | null;
  }
> = {
  paper: {
    bg: "#f6f3ec",
    fg: "#1a1815",
    muted: "#8a8478",
    accent: "#1a1815",
    rule: "#d8d2c4",
    glow: null,
  },
  dark: {
    bg: "#0e0d0b",
    fg: "#f6f3ec",
    muted: "#7a756c",
    accent: "#f6f3ec",
    rule: "#2a2823",
    glow: null,
  },
  hud: {
    bg: "#06080a",
    fg: "#7fd9e6",
    muted: "#4a8896",
    accent: "#7fd9e6",
    rule: "#143038",
    glow:
      "radial-gradient(circle at 30% 50%, rgba(127,217,230,0.18), rgba(127,217,230,0) 55%)",
  },
};

/* ──────────────────────────────────────────────────────────────────────────
   Constants
   ────────────────────────────────────────────────────────────────────────── */

export const KIWI_PATH =
  "m20.741,5.991c.21-.595.299-1.234.243-1.88-.114-1.326-.812-2.532-1.913-3.309-1.422-1.002-3.378-1.072-4.87-.174-.307.185-.59.403-.841.647-.807.786-2.119,1.723-3.788,1.723h-.794C4.18,2.998.334,6.462.022,10.884c-.174,2.468.725,4.883,2.468,6.625.844.844,1.848,1.484,2.938,1.906l.573,4.583h2.191l-.499-4.04c.271.026.544.04.818.04.201,0,.403-.007.604-.021.447-.032.881-.108,1.305-.209l.529,4.231h2.168l-.706-4.987c2.729-1.469,4.589-4.425,4.589-7.791l.021-2.262c.615-.069,1.187-.271,1.708-.568,3.845,3.229,4.272,8.608,4.272,8.608h1c0-5.446-2.104-9.299-3.259-11.007Zm-3.943.98c-1.025.115-1.798.952-1.798,1.947v2.302c0,3.553-2.647,6.523-6.026,6.761-1.891.131-3.737-.555-5.07-1.887-1.333-1.333-2.021-3.181-1.887-5.071.238-3.379,3.208-6.026,6.761-6.026h.794c1.852,0,3.645-.792,5.183-2.29.141-.137.301-.261.477-.366.823-.495,1.901-.458,2.686.095.627.442,1.008,1.098,1.073,1.846.063.737-.2,1.46-.723,1.983-.398.398-.907.642-1.47.705Zm1.202-2.473c0,.828-.672,1.5-1.5,1.5s-1.5-.672-1.5-1.5.672-1.5,1.5-1.5,1.5.672,1.5,1.5Z";

export const TAGLINE = "A personal life-OS for people who refuse to specialize.";

/* ──────────────────────────────────────────────────────────────────────────
   Asset registry
   ────────────────────────────────────────────────────────────────────────── */

export type AssetId =
  | "wordmark"
  | "monogram"
  | "kiwi-mark"
  | "kiwi-lockup"
  | "jarvis-lockup"
  | "banner-linkedin"
  | "banner-github"
  | "banner-square";

export const ASSETS: Record<AssetId, { label: string; size: { width: number; height: number } }> = {
  wordmark: { label: "Wordmark", size: { width: 1200, height: 360 } },
  monogram: { label: "Monogram (H)", size: { width: 600, height: 600 } },
  "kiwi-mark": { label: "Kiwi mark", size: { width: 600, height: 600 } },
  "kiwi-lockup": { label: "Kiwi lockup", size: { width: 1200, height: 600 } },
  "jarvis-lockup": { label: "JARVIS lockup", size: { width: 1200, height: 600 } },
  "banner-linkedin": { label: "LinkedIn cover", size: { width: 1584, height: 396 } },
  "banner-github": { label: "GitHub README hero", size: { width: 1280, height: 640 } },
  "banner-square": { label: "Social square", size: { width: 1080, height: 1080 } },
};

/* ──────────────────────────────────────────────────────────────────────────
   Font embedding helpers
   ────────────────────────────────────────────────────────────────────────── */

function ab2base64(ab: ArrayBuffer): string {
  // Node-only path (route handler runs on nodejs runtime).
  return Buffer.from(ab).toString("base64");
}

/**
 * Build a `<style>` block embedding EB Garamond at weights 400 + 600.
 * Returns empty string if Google Fonts is unreachable.
 */
async function fontStyleBlock(): Promise<string> {
  const [bold, regular] = await Promise.all([
    loadEbGaramond(600, false),
    loadEbGaramond(400, false),
  ]);
  const faces: string[] = [];
  if (regular)
    faces.push(
      `@font-face{font-family:'EB Garamond';font-weight:400;font-style:normal;src:url(data:font/woff2;base64,${ab2base64(regular)}) format('woff2');}`,
    );
  if (bold)
    faces.push(
      `@font-face{font-family:'EB Garamond';font-weight:600;font-style:normal;src:url(data:font/woff2;base64,${ab2base64(bold)}) format('woff2');}`,
    );
  if (faces.length === 0) return "";
  return `<style>${faces.join("")}</style>`;
}

/* ──────────────────────────────────────────────────────────────────────────
   SVG renderers
   ────────────────────────────────────────────────────────────────────────── */

const serifStack = "EB Garamond, Georgia, 'Times New Roman', serif";
const monoStack =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

function svgRoot(
  width: number,
  height: number,
  inner: string,
  fontStyle: string,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${fontStyle}${inner}</svg>`;
}

function bgRect(width: number, height: number, theme: ThemeKey): string {
  return `<rect width="${width}" height="${height}" fill="${THEMES[theme].bg}"/>`;
}

// Cyan radial overlay for HUD theme — same as the PNG version's `glow` token.
function hudOverlay(width: number, height: number, theme: ThemeKey): string {
  if (theme !== "hud") return "";
  const cx = width * 0.3;
  const cy = height * 0.5;
  const r = Math.max(width, height) * 0.55;
  return `<defs><radialGradient id="hudGlow" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#7fd9e6" stop-opacity="0.18"/><stop offset="100%" stop-color="#7fd9e6" stop-opacity="0"/></radialGradient></defs><rect width="${width}" height="${height}" fill="url(#hudGlow)"/>`;
}

/* ── Individual assets ─────────────────────────────────────────────────── */

async function renderWordmarkSvg(theme: ThemeKey): Promise<string> {
  const t = THEMES[theme];
  const { width, height } = ASSETS.wordmark.size;
  const fontStyle = await fontStyleBlock();
  const inner = `
    ${bgRect(width, height, theme)}
    ${hudOverlay(width, height, theme)}
    <text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="central"
      font-family="${serifStack}" font-weight="600" font-size="180"
      letter-spacing="-6" fill="${t.fg}">Hyperpolymath</text>`;
  return svgRoot(width, height, inner, fontStyle);
}

async function renderMonogramSvg(theme: ThemeKey): Promise<string> {
  const t = THEMES[theme];
  const { width, height } = ASSETS.monogram.size;
  const fontStyle = await fontStyleBlock();
  const inner = `
    ${bgRect(width, height, theme)}
    ${hudOverlay(width, height, theme)}
    <text x="${width / 2}" y="${height / 2 + 20}" text-anchor="middle" dominant-baseline="central"
      font-family="${serifStack}" font-weight="600" font-size="420"
      letter-spacing="-12" fill="${t.fg}">H</text>`;
  return svgRoot(width, height, inner, fontStyle);
}

function renderKiwiMarkSvg(theme: ThemeKey): string {
  const t = THEMES[theme];
  const { width, height } = ASSETS["kiwi-mark"].size;
  const kiwiSize = 360;
  const x = (width - kiwiSize) / 2;
  const y = (height - kiwiSize) / 2;
  const scale = kiwiSize / 24;
  const inner = `
    ${bgRect(width, height, theme)}
    ${hudOverlay(width, height, theme)}
    <g transform="translate(${x} ${y}) scale(${scale})">
      <path d="${KIWI_PATH}" fill="${t.accent}"/>
    </g>`;
  return svgRoot(width, height, inner, "");
}

async function renderKiwiLockupSvg(theme: ThemeKey): Promise<string> {
  const t = THEMES[theme];
  const { width, height } = ASSETS["kiwi-lockup"].size;
  const fontStyle = await fontStyleBlock();

  // Composition: kiwi on left, "Kiwi" wordmark right, "by Hyperpolymath"
  // caption tucked beneath the wordmark.
  const kiwiSize = 240;
  const kiwiX = 180;
  const kiwiY = (height - kiwiSize) / 2;
  const kiwiScale = kiwiSize / 24;
  const textX = kiwiX + kiwiSize + 56;

  const inner = `
    ${bgRect(width, height, theme)}
    ${hudOverlay(width, height, theme)}
    <g transform="translate(${kiwiX} ${kiwiY}) scale(${kiwiScale})">
      <path d="${KIWI_PATH}" fill="${t.accent}"/>
    </g>
    <text x="${textX}" y="${height / 2 - 20}" dominant-baseline="alphabetic"
      font-family="${serifStack}" font-weight="600" font-size="180"
      letter-spacing="-5" fill="${t.fg}">Kiwi</text>
    <text x="${textX}" y="${height / 2 + 60}" dominant-baseline="hanging"
      font-family="${monoStack}" font-size="22" letter-spacing="4.4"
      fill="${t.muted}">BY HYPERPOLYMATH</text>`;
  return svgRoot(width, height, inner, fontStyle);
}

async function renderJarvisLockupSvg(theme: ThemeKey): Promise<string> {
  const t = THEMES[theme];
  const { width, height } = ASSETS["jarvis-lockup"].size;
  const fontStyle = await fontStyleBlock();

  // HUD ring composition: 3 concentric rings + 24 ticks + central kiwi.
  // Cyan accent regardless of theme (the rings ARE the HUD signature).
  const ringColor = "#7fd9e6";
  const cx = 240;
  const cy = height / 2;
  const rOuter = 200;
  const rMid = 152;
  const rInner = 100;

  const ticks = Array.from({ length: 24 }, (_, i) => {
    const angle = (i * 360) / 24;
    return `<line x1="${cx}" y1="${cy - rOuter}" x2="${cx}" y2="${cy - rOuter + 14}" stroke="${ringColor}" stroke-width="1.5" opacity="${i % 3 === 0 ? 0.9 : 0.4}" transform="rotate(${angle} ${cx} ${cy})"/>`;
  }).join("");

  const kiwiSize = 80;
  const kx = cx - kiwiSize / 2;
  const ky = cy - kiwiSize / 2;
  const kScale = kiwiSize / 24;
  const textX = cx + rOuter + 80;

  const inner = `
    ${bgRect(width, height, theme)}
    ${hudOverlay(width, height, theme)}
    <circle cx="${cx}" cy="${cy}" r="${rOuter}" stroke="${ringColor}" stroke-width="1.5" fill="none" opacity="0.6"/>
    ${ticks}
    <circle cx="${cx}" cy="${cy}" r="${rOuter - 20}" stroke="${ringColor}" stroke-width="0.75" fill="none" opacity="0.35"/>
    <circle cx="${cx}" cy="${cy}" r="${rMid}" stroke="${ringColor}" stroke-width="1.5" fill="none" opacity="0.45" stroke-dasharray="3 9"/>
    <circle cx="${cx}" cy="${cy}" r="${rInner}" stroke="${ringColor}" stroke-width="0.75" fill="none" opacity="0.4"/>
    <circle cx="${cx}" cy="${cy}" r="${rInner - 20}" fill="${ringColor}" opacity="0.08"/>
    <g transform="translate(${kx} ${ky}) scale(${kScale})">
      <path d="${KIWI_PATH}" fill="${ringColor}" opacity="0.95"/>
    </g>
    <text x="${textX}" y="${cy - 20}" dominant-baseline="alphabetic"
      font-family="${serifStack}" font-weight="600" font-size="180"
      letter-spacing="-5" fill="${t.fg}">JARVIS</text>
    <text x="${textX}" y="${cy + 60}" dominant-baseline="hanging"
      font-family="${monoStack}" font-size="22" letter-spacing="4.4"
      fill="${t.muted}">BY HYPERPOLYMATH</text>`;
  return svgRoot(width, height, inner, fontStyle);
}

async function renderBannerSvg(
  id: "banner-linkedin" | "banner-github" | "banner-square",
  theme: ThemeKey,
): Promise<string> {
  const t = THEMES[theme];
  const { width, height } = ASSETS[id].size;
  const fontStyle = await fontStyleBlock();
  const isWide = id === "banner-linkedin";
  const isSquare = id === "banner-square";

  const wordmarkSize = isWide ? 132 : isSquare ? 200 : 156;
  const taglineSize = isWide ? 28 : isSquare ? 40 : 32;
  const kiwiSize = isWide ? 88 : isSquare ? 132 : 104;
  const padX = isWide ? 96 : isSquare ? 120 : 104;
  const gap = isWide ? 36 : isSquare ? 56 : 48;

  // Vertically center a 2-row block:
  //   row 1 = kiwi + wordmark (sharing a vertical center)
  //   row 2 = tagline
  // Sizing each row by its own intrinsic height and using `dominant-baseline=
  // hanging` so SVG and CSS interpretations stay consistent.
  const row1Height = Math.max(wordmarkSize, kiwiSize);
  const taglineLineHeight = 1.3;
  const row2Height = taglineSize * taglineLineHeight;
  const blockHeight = row1Height + gap + row2Height;
  const blockTop = (height - blockHeight) / 2;

  const kiwiScale = kiwiSize / 24;
  const kiwiX = padX;
  const kiwiY = blockTop + (row1Height - kiwiSize) / 2;
  const wordmarkX = padX + kiwiSize + (isWide ? 32 : 40);
  const wordmarkTop = blockTop + (row1Height - wordmarkSize) / 2;
  const taglineTop = blockTop + row1Height + gap;

  const inner = `
    ${bgRect(width, height, theme)}
    ${hudOverlay(width, height, theme)}
    <g transform="translate(${kiwiX} ${kiwiY}) scale(${kiwiScale})">
      <path d="${KIWI_PATH}" fill="${t.accent}"/>
    </g>
    <text x="${wordmarkX}" y="${wordmarkTop}" dominant-baseline="hanging"
      font-family="${serifStack}" font-weight="600" font-size="${wordmarkSize}"
      letter-spacing="${-wordmarkSize * 0.035}" fill="${t.fg}">Hyperpolymath</text>
    <text x="${padX}" y="${taglineTop}" dominant-baseline="hanging"
      font-family="${serifStack}" font-weight="400" font-size="${taglineSize}"
      fill="${t.muted}">${TAGLINE}</text>`;

  return svgRoot(width, height, inner, fontStyle);
}

/* ── Public SVG entry point ────────────────────────────────────────────── */

export async function renderAssetSvg(
  id: AssetId,
  theme: ThemeKey,
): Promise<string> {
  switch (id) {
    case "wordmark":
      return renderWordmarkSvg(theme);
    case "monogram":
      return renderMonogramSvg(theme);
    case "kiwi-mark":
      return renderKiwiMarkSvg(theme);
    case "kiwi-lockup":
      return renderKiwiLockupSvg(theme);
    case "jarvis-lockup":
      return renderJarvisLockupSvg(theme);
    case "banner-linkedin":
    case "banner-github":
    case "banner-square":
      return renderBannerSvg(id, theme);
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   JSX renderers (for ImageResponse → PNG)
   ────────────────────────────────────────────────────────────────────────── */

const flex = { display: "flex" } as const;

function background(theme: ThemeKey): React.CSSProperties {
  const t = THEMES[theme];
  return { background: t.bg, ...flex };
}

function HudOverlay({ theme }: { theme: ThemeKey }) {
  if (theme !== "hud") return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: THEMES.hud.glow!,
        ...flex,
      }}
    />
  );
}

function KiwiSvg({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={KIWI_PATH} fill={color} />
    </svg>
  );
}

function renderWordmarkJsx(theme: ThemeKey): ReactElement {
  const t = THEMES[theme];
  const { width, height } = ASSETS.wordmark.size;
  return (
    <div
      style={{
        width,
        height,
        ...background(theme),
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
      }}
    >
      <HudOverlay theme={theme} />
      <span
        style={{
          fontFamily: "EB Garamond, Georgia, serif",
          fontWeight: 600,
          fontSize: 180,
          letterSpacing: "-0.035em",
          color: t.fg,
          lineHeight: 1,
          display: "flex",
          zIndex: 1,
        }}
      >
        Hyperpolymath
      </span>
    </div>
  );
}

function renderMonogramJsx(theme: ThemeKey): ReactElement {
  const t = THEMES[theme];
  const { width, height } = ASSETS.monogram.size;
  return (
    <div
      style={{
        width,
        height,
        ...background(theme),
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
      }}
    >
      <HudOverlay theme={theme} />
      <span
        style={{
          fontFamily: "EB Garamond, Georgia, serif",
          fontWeight: 600,
          fontSize: 420,
          letterSpacing: "-0.03em",
          color: t.fg,
          lineHeight: 1,
          display: "flex",
          zIndex: 1,
        }}
      >
        H
      </span>
    </div>
  );
}

function renderKiwiMarkJsx(theme: ThemeKey): ReactElement {
  const t = THEMES[theme];
  const { width, height } = ASSETS["kiwi-mark"].size;
  return (
    <div
      style={{
        width,
        height,
        ...background(theme),
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
      }}
    >
      <HudOverlay theme={theme} />
      <div style={{ ...flex, zIndex: 1 }}>
        <KiwiSvg size={360} color={t.accent} />
      </div>
    </div>
  );
}

function renderKiwiLockupJsx(theme: ThemeKey): ReactElement {
  const t = THEMES[theme];
  const { width, height } = ASSETS["kiwi-lockup"].size;
  return (
    <div
      style={{
        width,
        height,
        ...background(theme),
        alignItems: "center",
        gap: 56,
        paddingLeft: 180,
        position: "relative",
      }}
    >
      <HudOverlay theme={theme} />
      <div style={{ ...flex, zIndex: 1 }}>
        <KiwiSvg size={240} color={t.accent} />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontFamily: "EB Garamond, Georgia, serif",
            fontWeight: 600,
            fontSize: 180,
            letterSpacing: "-0.03em",
            color: t.fg,
            lineHeight: 1,
            display: "flex",
          }}
        >
          Kiwi
        </span>
        <span
          style={{
            marginTop: 24,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 22,
            letterSpacing: "0.2em",
            color: t.muted,
            display: "flex",
          }}
        >
          BY HYPERPOLYMATH
        </span>
      </div>
    </div>
  );
}

function renderJarvisLockupJsx(theme: ThemeKey): ReactElement {
  const t = THEMES[theme];
  const { width, height } = ASSETS["jarvis-lockup"].size;
  const ringColor = "#7fd9e6";
  // Inline HUD ring as SVG so the composition matches the SVG download.
  const cx = 200;
  const cy = 200;
  const rOuter = 180;
  const rMid = 136;
  const rInner = 90;
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const angle = (i * 360) / 24;
    return (
      <line
        key={i}
        x1={cx}
        y1={cy - rOuter}
        x2={cx}
        y2={cy - rOuter + 12}
        stroke={ringColor}
        strokeWidth="1.5"
        opacity={i % 3 === 0 ? 0.9 : 0.4}
        transform={`rotate(${angle} ${cx} ${cy})`}
      />
    );
  });

  return (
    <div
      style={{
        width,
        height,
        ...background(theme),
        alignItems: "center",
        gap: 80,
        paddingLeft: 60,
        position: "relative",
      }}
    >
      <HudOverlay theme={theme} />
      <div style={{ ...flex, zIndex: 1 }}>
        <svg width={400} height={400} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
          <circle cx={cx} cy={cy} r={rOuter} stroke={ringColor} strokeWidth="1.5" fill="none" opacity="0.6" />
          {ticks}
          <circle cx={cx} cy={cy} r={rOuter - 20} stroke={ringColor} strokeWidth="0.75" fill="none" opacity="0.35" />
          <circle cx={cx} cy={cy} r={rMid} stroke={ringColor} strokeWidth="1.5" fill="none" opacity="0.45" strokeDasharray="3 9" />
          <circle cx={cx} cy={cy} r={rInner} stroke={ringColor} strokeWidth="0.75" fill="none" opacity="0.4" />
          <circle cx={cx} cy={cy} r={rInner - 20} fill={ringColor} opacity="0.08" />
          <g transform={`translate(${cx - 40} ${cy - 40}) scale(${80 / 24})`}>
            <path d={KIWI_PATH} fill={ringColor} opacity="0.95" />
          </g>
        </svg>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontFamily: "EB Garamond, Georgia, serif",
            fontWeight: 600,
            fontSize: 180,
            letterSpacing: "-0.03em",
            color: t.fg,
            lineHeight: 1,
            display: "flex",
          }}
        >
          JARVIS
        </span>
        <span
          style={{
            marginTop: 24,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 22,
            letterSpacing: "0.2em",
            color: t.muted,
            display: "flex",
          }}
        >
          BY HYPERPOLYMATH
        </span>
      </div>
    </div>
  );
}

function renderBannerJsx(
  id: "banner-linkedin" | "banner-github" | "banner-square",
  theme: ThemeKey,
): ReactElement {
  const t = THEMES[theme];
  const { width, height } = ASSETS[id].size;
  const isWide = id === "banner-linkedin";
  const isSquare = id === "banner-square";

  const wordmarkSize = isWide ? 132 : isSquare ? 200 : 156;
  const taglineSize = isWide ? 28 : isSquare ? 40 : 32;
  const kiwiSize = isWide ? 88 : isSquare ? 132 : 104;
  const padX = isWide ? 96 : isSquare ? 120 : 104;
  const gap = isWide ? 36 : isSquare ? 56 : 48;

  return (
    <div
      style={{
        width,
        height,
        ...flex,
        flexDirection: "column",
        background: t.bg,
        color: t.fg,
        fontFamily: "EB Garamond, Georgia, serif",
        padding: `0 ${padX}px`,
        justifyContent: "center",
        alignItems: "flex-start",
        gap,
        position: "relative",
      }}
    >
      <HudOverlay theme={theme} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: isWide ? 32 : 40,
          zIndex: 1,
        }}
      >
        <KiwiSvg size={kiwiSize} color={t.accent} />
        <span
          style={{
            fontSize: wordmarkSize,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: "-0.035em",
            display: "flex",
          }}
        >
          Hyperpolymath
        </span>
      </div>
      <div
        style={{
          fontSize: taglineSize,
          fontWeight: 400,
          color: t.muted,
          lineHeight: 1.3,
          maxWidth: isWide ? 1200 : 880,
          letterSpacing: "-0.005em",
          display: "flex",
          zIndex: 1,
        }}
      >
        {TAGLINE}
      </div>
    </div>
  );
}

export function renderAssetJsx(id: AssetId, theme: ThemeKey): ReactElement {
  switch (id) {
    case "wordmark":
      return renderWordmarkJsx(theme);
    case "monogram":
      return renderMonogramJsx(theme);
    case "kiwi-mark":
      return renderKiwiMarkJsx(theme);
    case "kiwi-lockup":
      return renderKiwiLockupJsx(theme);
    case "jarvis-lockup":
      return renderJarvisLockupJsx(theme);
    case "banner-linkedin":
    case "banner-github":
    case "banner-square":
      return renderBannerJsx(id, theme);
  }
}
