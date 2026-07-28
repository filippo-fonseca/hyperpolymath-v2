import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

/**
 * Shared helpers for the wave-1 integration verification specs.
 *
 * These exist so the design-contract spec, the defect spec and the evidence
 * spec all measure the same things the same way. In particular `probeToken`
 * is the only sanctioned way to read a design token: Chromium resolves an
 * `oklch()` custom property to a `lab()` string, which is useless for a
 * contrast calculation, so every token read goes through a real element whose
 * `background-color` Chromium is forced to resolve to `rgb()`.
 */

export const EVIDENCE_DIR =
  process.env.VERIFY_EVIDENCE_DIR ??
  "/Users/filippofonseca/Developer/Projects/hyperpolymath-v2/.bgsd/runs/sesh-1785262075262/evidence/integration";

export function ensureEvidenceDir(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

/** Write a machine-readable artifact next to the screenshots. */
export function writeArtifact(name: string, data: unknown): string {
  ensureEvidenceDir();
  const path = join(EVIDENCE_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2));
  return path;
}

export function shot(page: Page, name: string) {
  ensureEvidenceDir();
  return page.screenshot({ path: join(EVIDENCE_DIR, `${name}.png`), fullPage: false });
}

/**
 * Force a theme before the app's first paint.
 *
 * next-themes reads its storage key in a blocking inline script, so setting it
 * via `addInitScript` means the very first frame is already in the right theme
 * and no assertion ever races the mount guard. The key is
 * `hyperpolymath-theme`, not the next-themes default `theme`
 * (`app/providers.tsx:25`); using the default silently leaves you in light and
 * every "dark" assertion then measures the light palette.
 */
export async function forceTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("hyperpolymath-theme", t as string);
    } catch {
      // localStorage unavailable — assertThemeApplied below still catches it.
    }
  }, theme);
}

/** Fail loudly if the theme did not actually apply, rather than measuring the wrong palette. */
export async function assertThemeApplied(page: Page, theme: "light" | "dark"): Promise<void> {
  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  if (isDark !== (theme === "dark")) {
    throw new Error(
      `theme did not apply: expected ${theme}, <html class> dark=${isDark}. Check the next-themes storageKey in app/providers.tsx.`
    );
  }
}

/** Settle fonts, entry animations and the 260ms right-slot transition. */
export async function settle(page: Page, ms = 1400): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

/**
 * Resolve a CSS custom property to `rgb()` by painting it onto a real element.
 * Returns `[r, g, b]` in 0-255.
 */
export async function probeToken(page: Page, token: string): Promise<[number, number, number]> {
  const rgb = await page.evaluate((name) => {
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.pointerEvents = "none";
    el.style.opacity = "0";
    el.style.backgroundColor = `var(${name})`;
    document.body.appendChild(el);
    const computed = getComputedStyle(el).backgroundColor;
    el.remove();

    // Chromium serializes an `oklch()` custom property as `lab(...)` even off a
    // painted element, which is useless for a WCAG ratio. Rasterizing it to a
    // 1x1 sRGB canvas returns the bytes actually sent to the screen, which is
    // the thing the contrast criterion is really about.
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context to rasterize a token");
    ctx.fillStyle = computed;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, computed };
  }, token);

  if (rgb.r === 0 && rgb.g === 0 && rgb.b === 0 && !/rgb\(0, 0, 0\)|#000/.test(rgb.computed)) {
    throw new Error(`token ${token} rasterized to black from "${rgb.computed}" — probe failed`);
  }
  return [rgb.r, rgb.g, rgb.b];
}

export function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, rounded to 2dp. */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** The cockpit grid root, and how many live tracks it currently has. */
export async function gridTracks(page: Page): Promise<{ raw: string; count: number }> {
  return page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>("div.isolate.grid");
    if (!grid) throw new Error("cockpit grid root not found");
    const raw = getComputedStyle(grid).gridTemplateColumns;
    // A collapsed / absent track computes to `0px`; it is a declared track but
    // not a *live* column, and §2.2 is about live columns.
    const count = raw.split(/\s+/).filter((t) => t !== "0px").length;
    return { raw, count };
  });
}
