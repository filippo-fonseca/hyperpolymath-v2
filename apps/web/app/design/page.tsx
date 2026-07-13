/**
 * /design: the living style guide.
 *
 * Public, unauthenticated reference for the `--sd-*` register documented in
 * `docs/DESIGN-SYSTEM.md`. Every swatch, pill, and recipe below consumes the
 * shipped `.sd-*` utilities and `components/ui/icons` directly, so this page
 * can never drift from the implementation.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { FolderIcon, TaskIcon, WidgetIcon } from "@/components/ui/icons";
import { TokenLadder } from "./TokenSwatches";

export const metadata: Metadata = {
  title: "Design System · Hyperpolymath",
  description:
    "The living reference for Hyperpolymath's --sd-* register: tokens, chrome grammar, motion law, and icons, rendered from the shipped implementation.",
};

const DOC_URL =
  "https://github.com/filippo-fonseca/hyperpolymath-v2/blob/main/docs/DESIGN-SYSTEM.md";

function Eyebrow({ label }: { label: string }) {
  return (
    <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--sd-ink-faint)]">
      {label}
    </p>
  );
}

function Section({
  eyebrow,
  title,
  caption,
  children,
}: {
  eyebrow: string;
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div>
        <Eyebrow label={eyebrow} />
        <h2
          className="mt-2 font-serif font-semibold text-[22px] text-[var(--sd-ink)]"
          style={{ letterSpacing: "-0.01em" }}
        >
          {title}
        </h2>
        {caption ? (
          <p className="mt-1.5 text-[14px] text-[var(--sd-ink-dull)] max-w-[640px]">{caption}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

const RADII = [
  { label: "chrome: buttons, rows, menus", px: 6 },
  { label: "tiles", px: 8 },
  { label: "entity cards / panels", px: 12 },
  { label: "pills", px: 9999 },
];

const MOTION_LAW = [
  { moment: "Entrances", timing: "opacity 0→1, y 4→0, 160ms", easing: "ease-out" },
  { moment: "Collapses", timing: "height: auto", easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
  { moment: "Micro (color/bg/border)", timing: "120-150ms", easing: "ease-out" },
  {
    moment: "Hover soft-landing",
    timing: "transform/shadow 200ms, opacity trailing 400ms",
    easing: "cubic-bezier(0.23, 1, 0.32, 1)",
  },
  { moment: "Press", timing: "transform 100ms", easing: "ease-out" },
  {
    moment: "Dialogs",
    timing: "opacity 0→1, translateY(-2%) scale(.96)→1",
    easing: "ease-out",
  },
  { moment: "Success / confirm overshoot", timing: "~4% spring", easing: "spring" },
];

export default function DesignSystemPage() {
  return (
    <main
      className="min-h-screen"
      style={{ background: "var(--sd-app)", color: "var(--sd-ink)" }}
    >
      <div className="mx-auto w-full max-w-[960px] px-8 py-16 space-y-16">
        <header className="space-y-4">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)] transition-colors w-fit"
            >
              ← Hyperpolymath
            </Link>
            <ThemeToggle variant="header" />
          </div>
          <div>
            <Eyebrow label="§ DESIGN · SD REGISTER" />
            <h1
              className="mt-3 font-serif font-semibold text-[32px] text-[var(--sd-ink)]"
              style={{ letterSpacing: "-0.02em" }}
            >
              Design System
            </h1>
            <p className="mt-2 text-[15px] text-[var(--sd-ink-dull)] max-w-[640px]">
              "Spacedrive × Raycast × Renaissance." One chrome dialect app-wide, rendered live
              from the shipped tokens and utilities below, so this page can never drift from the
              implementation.
            </p>
            <a
              href={DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--sd-accent)] hover:opacity-80 transition-opacity"
            >
              docs/DESIGN-SYSTEM.md
              <ArrowUpRight size={12} strokeWidth={2} aria-hidden="true" />
            </a>
          </div>
        </header>

        <Section
          eyebrow="§ 01 · TOKENS"
          title="Tokens"
          caption="globals.css is the source of truth. Values below are read live off <html>. Toggle the theme switch above to see both ladders resolve."
        >
          <TokenLadder />
        </Section>

        <Section
          eyebrow="§ 02 · CHROME GRAMMAR"
          title="Radius scale"
          caption="6px default chrome, 8px tiles, 12px entity cards/panels, full for pills. Nothing above 12px except deliberate floating surfaces."
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {RADII.map((radius) => (
              <div key={radius.label} className="flex flex-col gap-2">
                <div
                  className="h-16 border"
                  style={{
                    background: "var(--sd-box)",
                    borderColor: "var(--sd-line)",
                    borderRadius: radius.px,
                  }}
                />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[10px] text-[var(--sd-ink-dull)]">
                    {radius.px === 9999 ? "full" : `${radius.px}px`}
                  </span>
                  <span className="font-mono text-[9px] text-[var(--sd-ink-faint)] text-right">
                    {radius.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="§ 03 · STATUS + PROGRESS"
          title="Status pills & progress"
          caption="Functional hues appear only as 6px dots and 15%-alpha tinted chips, never as chrome. .sd-progress-hatched marks the projected (not-yet-real) segment."
        >
          <div className="flex flex-wrap gap-3">
            <span className="sd-status-pill sd-tint-active">
              <span className="sd-dot sd-dot-active" aria-hidden="true" />
              Active
            </span>
            <span className="sd-status-pill sd-tint-synced">
              <span className="sd-dot sd-dot-synced" aria-hidden="true" />
              Synced
            </span>
            <span className="sd-status-pill sd-tint-idle">
              <span className="sd-dot sd-dot-idle" aria-hidden="true" />
              Idle
            </span>
            <span className="sd-status-pill sd-tint-warn">
              <span className="sd-dot sd-dot-warn" aria-hidden="true" />
              Warn
            </span>
          </div>
          <div className="max-w-[360px] space-y-1.5">
            <div className="sd-progress flex">
              <div className="sd-progress-fill" style={{ width: "55%" }} />
              <div className="sd-progress-hatched" style={{ width: "20%" }} />
            </div>
            <p className="font-mono text-[10px] text-[var(--sd-ink-faint)]">
              55% done · 20% projected
            </p>
          </div>
        </Section>

        <Section
          eyebrow="§ 04 · BUTTONS"
          title="Button recipes"
          caption='.sd-btn-primary is "lit from above": accent fill, ambient glow, white top bevel, dark bottom bevel. .sd-btn-ghost is translucent chrome.'
        >
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className="sd-btn-primary px-5 py-2.5 text-sm font-medium">
              Primary action
            </button>
            <button type="button" className="sd-btn-ghost px-5 py-2.5 text-sm font-medium">
              Ghost action
            </button>
          </div>
        </Section>

        <Section
          eyebrow="§ 05 · MOTION LAW"
          title="Motion timings"
          caption="Everything interruptible, transform/opacity/filter only, useReducedMotion() guarded. No transitions on first paint."
        >
          <div className="sd-panel overflow-hidden">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--sd-line)" }}>
                  <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)] font-medium">
                    Moment
                  </th>
                  <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)] font-medium">
                    Timing
                  </th>
                  <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)] font-medium">
                    Easing
                  </th>
                </tr>
              </thead>
              <tbody>
                {MOTION_LAW.map((row, i) => (
                  <tr
                    key={row.moment}
                    className={i < MOTION_LAW.length - 1 ? "border-b" : undefined}
                    style={{ borderColor: "var(--sd-line)" }}
                  >
                    <td className="px-4 py-2.5 text-[var(--sd-ink)]">{row.moment}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--sd-ink-dull)]">
                      {row.timing}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--sd-ink-dull)]">
                      {row.easing}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          eyebrow="§ 06 · ICONS"
          title="Dimensional icons"
          caption="Gradient-layered, cool-indigo bodies with useId-scoped defs. Accent never as body fill. Must read at 24px."
        >
          <div className="flex flex-wrap gap-10">
            {[
              { name: "TaskIcon", Icon: TaskIcon },
              { name: "FolderIcon", Icon: FolderIcon },
              { name: "WidgetIcon", Icon: WidgetIcon },
            ].map(({ name, Icon }) => (
              <div key={name} className="flex flex-col items-center gap-3">
                <div className="flex items-end gap-4">
                  <Icon size={24} title={name} />
                  <Icon size={48} title={name} />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
                  {name} · 24 / 48px
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </main>
  );
}
