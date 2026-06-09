/**
 * /branding — canonical brand reference + download center.
 *
 * Documents Hyperpolymath's visual identity (wordmark, monogram, Kiwi mark,
 * Kiwi lockup, JARVIS lockup, banners) and exposes SVG + PNG downloads for
 * every asset via /api/branding/asset.
 *
 * Reference only; do not improvise from this page.
 *
 * Plan: Quick 260609-luc (+ banner/lockup extension).
 */

import type { ReactNode } from "react";
import { HudCoreBubble } from "@/components/shared/HudCoreBubble";
import { SectionEyebrow } from "@/components/landing/SectionEyebrow";
import { ASSETS, type AssetId, type ThemeKey } from "@/lib/branding/svg";

export const metadata = { title: "Brand · Hyperpolymath" };

/* ──────────────────────────────────────────────────────────────────────────
   Theme palette (display-only — server route is the source of truth)
   ────────────────────────────────────────────────────────────────────────── */

const THEME_OPTIONS: { key: ThemeKey; label: string }[] = [
  { key: "paper", label: "Paper · --ink on --canvas" },
  { key: "dark", label: "Dark · --canvas on --ink" },
  { key: "hud", label: "HUD · --hud-cyan on near-black" },
];

/* ──────────────────────────────────────────────────────────────────────────
   Asset tile — image preview + SVG/PNG download links
   ────────────────────────────────────────────────────────────────────────── */

function assetUrl(id: AssetId, theme: ThemeKey, format: "svg" | "png", download = false) {
  const params = new URLSearchParams({ id, theme, format });
  if (download) params.set("download", "1");
  return `/api/branding/asset?${params.toString()}`;
}

function AssetTile({
  id,
  theme,
  label,
}: {
  id: AssetId;
  theme: { key: ThemeKey; label: string };
  label: string;
}) {
  const { width, height } = ASSETS[id].size;
  const ratio = width / height;
  const svgFile = `hyperpolymath-${id}-${theme.key}.svg`;
  const pngFile = `hyperpolymath-${id}-${theme.key}.png`;
  return (
    <div className="flex flex-col">
      <div
        className="overflow-hidden rounded-[12px]"
        style={{
          border: "1px solid var(--edge)",
          aspectRatio: ratio,
          background: "var(--surface)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl(id, theme.key, "svg")}
          alt={`${label} — ${theme.label}`}
          className="block h-full w-full"
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-muted)] truncate">
          {theme.label}
        </p>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href={assetUrl(id, theme.key, "svg", true)}
            download={svgFile}
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink)] underline-offset-4 hover:underline"
          >
            ↓ SVG
          </a>
          <a
            href={assetUrl(id, theme.key, "png", true)}
            download={pngFile}
            className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink)] underline-offset-4 hover:underline"
          >
            ↓ PNG
          </a>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Section wrapper
   ────────────────────────────────────────────────────────────────────────── */

function Section({
  label,
  title,
  caption,
  children,
}: {
  label: string;
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div>
        <SectionEyebrow label={label} />
        <h2
          className="mt-3 font-serif font-semibold text-[24px] text-[var(--ink)]"
          style={{ letterSpacing: "-0.02em" }}
        >
          {title}
        </h2>
        {caption ? (
          <p className="mt-2 font-serif text-[14px] text-[var(--ink-muted)] max-w-[640px]">
            {caption}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ThemeRow({ id, label }: { id: AssetId; label: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {THEME_OPTIONS.map((theme) => (
        <AssetTile key={theme.key} id={id} theme={theme} label={label} />
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Page
   ────────────────────────────────────────────────────────────────────────── */

export default function BrandingPage() {
  return (
    <main className="mx-auto w-full max-w-[960px] px-8 py-16 space-y-20">
      <header>
        <SectionEyebrow label="§ 00 · BRAND" />
        <h1
          className="mt-4 font-serif font-semibold text-[32px] text-[var(--ink)]"
          style={{ letterSpacing: "-0.02em" }}
        >
          Brand
        </h1>
        <p className="mt-2 font-serif text-[15px] text-[var(--ink-muted)] max-w-[640px]">
          Canonical marks, lockups, and color treatments for Hyperpolymath,
          Kiwi, and JARVIS. Every asset is downloadable as SVG (vector, EB
          Garamond embedded) or PNG (raster, generated server-side).
        </p>
      </header>

      <Section
        label="§ 01 · WORDMARK"
        title="Wordmark"
        caption="EB Garamond, 600 weight, -0.035em tracking. The wordmark IS the brand."
      >
        <ThemeRow id="wordmark" label="Wordmark" />
      </Section>

      <Section
        label="§ 02 · MONOGRAM"
        title="Monogram"
        caption="Single serif H. Use only when the full wordmark won't fit — favicons, app icons, tight chrome."
      >
        <ThemeRow id="monogram" label="Monogram" />
      </Section>

      <Section
        label="§ 03 · KIWI MARK"
        title="Kiwi mark"
        caption="Standalone kiwi-bird silhouette. The agent's symbol without the wordmark."
      >
        <ThemeRow id="kiwi-mark" label="Kiwi mark" />
      </Section>

      <Section
        label="§ 04 · KIWI LOCKUP"
        title="Kiwi by Hyperpolymath"
        caption="Kiwi mark + name + attribution. Use as a complete logo when introducing the agent."
      >
        <ThemeRow id="kiwi-lockup" label="Kiwi lockup" />
      </Section>

      <Section
        label="§ 05 · JARVIS LOCKUP"
        title="JARVIS by Hyperpolymath"
        caption="HUD ring + JARVIS wordmark + attribution. Cyan instrumentation stays cyan across themes — the rings ARE the JARVIS signature."
      >
        <ThemeRow id="jarvis-lockup" label="JARVIS lockup" />
      </Section>

      {/* Live JARVIS console reference — kept for parity with the in-app
          surface (animated, mic-aware). Not downloadable. */}
      <Section
        label="§ 05a · JARVIS · LIVE"
        title="Live HUD core (in-app)"
        caption="The same JARVIS visual as it appears inside the app — animated, mic-aware, and scoped via .agent-mode-scope."
      >
        <div className="flex flex-col items-start">
          <div
            className="agent-mode-scope relative overflow-hidden rounded-[12px]"
            style={{
              width: 280,
              height: 280,
              background: "var(--surface-raised)",
              border: "1px solid var(--edge-hud)",
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div style={{ transform: "scale(0.82)", transformOrigin: "center" }}>
                <HudCoreBubble state="idle" dimmed={false} />
              </div>
            </div>
          </div>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
            HUDCOREBUBBLE · agent-mode-scope · --hud-cyan
          </p>
        </div>
      </Section>

      <Section
        label="§ 06 · BANNERS"
        title="Banners"
        caption="Drop-in compositions for LinkedIn covers, GitHub README heroes, and square social posts. Same wordmark + tagline + kiwi accent across all three sizes."
      >
        <BannerGroup id="banner-linkedin" label="LinkedIn cover" usage="profile / page header" />
        <BannerGroup id="banner-github" label="GitHub README hero" usage="repo banner" />
        <BannerGroup id="banner-square" label="Social square" usage="instagram / x post" />
      </Section>
    </main>
  );
}

function BannerGroup({
  id,
  label,
  usage,
}: {
  id: AssetId;
  label: string;
  usage: string;
}) {
  const { width, height } = ASSETS[id].size;
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3
          className="font-serif font-semibold text-[18px] text-[var(--ink)]"
          style={{ letterSpacing: "-0.01em" }}
        >
          {label}
        </h3>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          {width}×{height} · {usage}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6">
        {THEME_OPTIONS.map((theme) => (
          <AssetTile key={theme.key} id={id} theme={theme} label={label} />
        ))}
      </div>
    </div>
  );
}
