/**
 * /branding — public brand reference.
 *
 * Documents Hyperpolymath's visual identity (wordmark, monogram, Kiwi mark,
 * Kiwi lockup, JARVIS lockup, banners). Each tile expands to a fullscreen
 * viewer on click. Public route — no auth required; linked from the
 * landing-page footer.
 *
 * Plan: Quick 260609-luc (banner/lockup extension).
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { HudCoreBubble } from "@/components/shared/HudCoreBubble";
import { SectionEyebrow } from "@/components/landing/SectionEyebrow";
import { type AssetId, type ThemeKey } from "@/lib/branding/svg";
import { AssetTile } from "./AssetTile";

export const metadata: Metadata = {
  title: "Brand · Hyperpolymath",
  description:
 "Canonical marks, lockups, and color treatments for Hyperpolymath, Kiwi, and JARVIS.",
};

const THEME_OPTIONS: { key: ThemeKey; label: string }[] = [
  { key: "paper", label: "Paper · --ink on --canvas" },
  { key: "dark", label: "Dark · --canvas on --ink" },
  { key: "hud", label: "HUD · --hud-cyan on near-black" },
];

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
          className="mt-3 font-semibold text-[24px] text-[var(--ink)]"
          style={{ letterSpacing: "-0.02em" }}
        >
          {title}
        </h2>
        {caption ? (
          <p className="mt-2 text-[14px] text-[var(--ink-muted)] max-w-[640px]">
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

function BannerGroup({
  id,
  label,
  usage,
}: {
  id: AssetId;
  label: string;
  usage: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3
          className="font-semibold text-[18px] text-[var(--ink)]"
          style={{ letterSpacing: "-0.01em" }}
        >
          {label}
        </h3>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
          {usage}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-8">
        {THEME_OPTIONS.map((theme) => (
          <AssetTile key={theme.key} id={id} theme={theme} label={label} />
        ))}
      </div>
    </div>
  );
}

export default function BrandingPage() {
  return (
    <main className="mx-auto w-full max-w-[960px] px-8 py-16 space-y-20">
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors w-fit"
          >
            ← Hyperpolymath
          </Link>
          <Link
            href="/design"
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors w-fit"
          >
            Design →
          </Link>
        </div>
        <div>
          <SectionEyebrow label="§ 00 · BRAND" />
          <h1
            className="mt-4 font-semibold text-[32px] text-[var(--ink)]"
            style={{ letterSpacing: "-0.02em" }}
          >
            Brand
          </h1>
          <p className="mt-2 text-[15px] text-[var(--ink-muted)] max-w-[640px]">
            Canonical marks, lockups, and color treatments for Hyperpolymath,
            Kiwi, and JARVIS. Click any tile to view fullscreen.
          </p>
        </div>
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
        caption="Drop-in compositions for LinkedIn covers, GitHub README heroes, and square social posts. Click any banner to view fullscreen, then right-click to save."
      >
        <BannerGroup
          id="banner-linkedin"
          label="LinkedIn cover"
          usage="1584×396 · profile / page header"
        />
        <BannerGroup
          id="banner-github"
          label="GitHub README hero"
          usage="1280×640 · repo banner"
        />
        <BannerGroup
          id="banner-square"
          label="Social square"
          usage="1080×1080 · instagram / x post"
        />
      </Section>
    </main>
  );
}
