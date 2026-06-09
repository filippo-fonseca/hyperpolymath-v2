/**
 * /branding — canonical brand reference page.
 *
 * Documents Hyperpolymath's visual identity: wordmark, monogram, Kiwi mark,
 * and JARVIS lockup, each in token-named swatch variations. Document register
 * throughout — only the JARVIS tile activates `.agent-mode-scope` (cyan HUD).
 *
 * Reference only; do not improvise from this page.
 *
 * Plan: Quick 260609-luc.
 */

import type { ReactNode } from "react";
import { HudCoreBubble } from "@/components/shared/HudCoreBubble";
import { SectionEyebrow } from "@/components/landing/SectionEyebrow";

export const metadata = { title: "Brand · Hyperpolymath" };

type SwatchKey =
  | "ink-on-canvas"
  | "canvas-on-ink"
  | "black-on-white"
  | "white-on-black"
  | "cyan-on-black";

const SWATCHES: {
  key: SwatchKey;
  bg: string;
  fg: string;
  caption: string;
  edgeToken: string;
}[] = [
  {
    key: "ink-on-canvas",
    bg: "var(--canvas)",
    fg: "var(--ink)",
    caption: "INK ON CANVAS · --ink / --canvas",
    edgeToken: "var(--edge)",
  },
  {
    key: "canvas-on-ink",
    bg: "var(--ink)",
    fg: "var(--canvas)",
    caption: "CANVAS ON INK · --canvas / --ink",
    edgeToken: "var(--edge)",
  },
  {
    key: "black-on-white",
    bg: "#ffffff",
    fg: "#000000",
    caption: "PURE BLACK ON WHITE · #000 / #fff",
    edgeToken: "var(--edge)",
  },
  {
    key: "white-on-black",
    bg: "#000000",
    fg: "#ffffff",
    caption: "PURE WHITE ON BLACK · #fff / #000",
    edgeToken: "var(--edge)",
  },
  {
    key: "cyan-on-black",
    bg: "#000000",
    fg: "var(--hud-cyan)",
    caption: "HUD CYAN ON BLACK · --hud-cyan / #000",
    edgeToken: "var(--edge-hud)",
  },
];

function BrandChip({
  bg,
  edgeToken,
  caption,
  children,
}: {
  bg: string;
  edgeToken: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div
        className="flex items-center justify-center rounded-[12px]"
        style={{
          background: bg,
          border: `1px solid ${edgeToken}`,
          width: 220,
          height: 140,
        }}
      >
        {children}
      </div>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--ink-muted)]">
        {caption}
      </p>
    </div>
  );
}

function WordmarkGlyph({
  color,
  text = "Hyperpolymath",
  size = 28,
}: {
  color: string;
  text?: string;
  size?: number;
}) {
  return (
    <span
      className="font-serif font-semibold select-none"
      style={{
        color,
        letterSpacing: "-0.03em",
        fontSize: size,
        lineHeight: 1,
      }}
    >
      {text}
    </span>
  );
}

function KiwiGlyph({ color, size = 64 }: { color: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="m20.741,5.991c.21-.595.299-1.234.243-1.88-.114-1.326-.812-2.532-1.913-3.309-1.422-1.002-3.378-1.072-4.87-.174-.307.185-.59.403-.841.647-.807.786-2.119,1.723-3.788,1.723h-.794C4.18,2.998.334,6.462.022,10.884c-.174,2.468.725,4.883,2.468,6.625.844.844,1.848,1.484,2.938,1.906l.573,4.583h2.191l-.499-4.04c.271.026.544.04.818.04.201,0,.403-.007.604-.021.447-.032.881-.108,1.305-.209l.529,4.231h2.168l-.706-4.987c2.729-1.469,4.589-4.425,4.589-7.791l.021-2.262c.615-.069,1.187-.271,1.708-.568,3.845,3.229,4.272,8.608,4.272,8.608h1c0-5.446-2.104-9.299-3.259-11.007Zm-3.943.98c-1.025.115-1.798.952-1.798,1.947v2.302c0,3.553-2.647,6.523-6.026,6.761-1.891.131-3.737-.555-5.07-1.887-1.333-1.333-2.021-3.181-1.887-5.071.238-3.379,3.208-6.026,6.761-6.026h.794c1.852,0,3.645-.792,5.183-2.29.141-.137.301-.261.477-.366.823-.495,1.901-.458,2.686.095.627.442,1.008,1.098,1.073,1.846.063.737-.2,1.46-.723,1.983-.398.398-.907.642-1.47.705Zm1.202-2.473c0,.828-.672,1.5-1.5,1.5s-1.5-.672-1.5-1.5.672-1.5,1.5-1.5,1.5.672,1.5,1.5Z"
        fill={color}
      />
    </svg>
  );
}

function Section({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
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
      </div>
      {children}
    </section>
  );
}

export default function BrandingPage() {
  return (
    <main className="mx-auto w-full max-w-[960px] px-8 py-16 space-y-20">
      {/* Page header */}
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
          Kiwi, and JARVIS. Reference only — do not improvise from this page.
        </p>
      </header>

      {/* § 01 · WORDMARK */}
      <Section label="§ 01 · WORDMARK" title="Wordmark">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-8">
          {SWATCHES.map((s) => (
            <BrandChip
              key={s.key}
              bg={s.bg}
              edgeToken={s.edgeToken}
              caption={s.caption}
            >
              <WordmarkGlyph color={s.fg} text="Hyperpolymath" size={28} />
            </BrandChip>
          ))}
        </div>
      </Section>

      {/* § 02 · MONOGRAM */}
      <Section label="§ 02 · MONOGRAM" title="Monogram">
        <div className="flex flex-wrap gap-x-6 gap-y-8">
          <BrandChip
            bg="var(--canvas)"
            edgeToken="var(--edge)"
            caption="H · 48PX SERIF"
          >
            <WordmarkGlyph color="var(--ink)" text="H" size={48} />
          </BrandChip>
          <BrandChip
            bg="var(--canvas)"
            edgeToken="var(--edge)"
            caption="H · 96PX SERIF"
          >
            <WordmarkGlyph color="var(--ink)" text="H" size={96} />
          </BrandChip>
        </div>
      </Section>

      {/* § 03 · KIWI */}
      <Section label="§ 03 · KIWI" title="Kiwi by Hyperpolymath">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-8">
          {SWATCHES.map((s) => (
            <BrandChip
              key={s.key}
              bg={s.bg}
              edgeToken={s.edgeToken}
              caption={s.caption}
            >
              <KiwiGlyph color={s.fg} size={64} />
            </BrandChip>
          ))}
        </div>
        <p className="font-serif text-[14px] text-[var(--ink-muted)] mt-4">
          Standalone agent mark — Kiwi by Hyperpolymath.
        </p>
      </Section>

      {/* § 04 · JARVIS */}
      <Section label="§ 04 · JARVIS" title="JARVIS by Hyperpolymath">
        <div className="flex flex-col items-center">
          <div className="mb-3">
            <WordmarkGlyph color="var(--ink)" text="JARVIS" size={32} />
          </div>
          <div
            className="agent-mode-scope relative overflow-hidden rounded-[12px]"
            style={{
              width: 240,
              height: 240,
              background: "var(--surface-raised)",
              border: "1px solid var(--edge-hud)",
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div style={{ transform: "scale(0.7)", transformOrigin: "center" }}>
                <HudCoreBubble state="idle" dimmed={false} />
              </div>
            </div>
          </div>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
            JARVIS BY HYPERPOLYMATH · agent-mode-scope · --hud-cyan
          </p>
        </div>
      </Section>
    </main>
  );
}
