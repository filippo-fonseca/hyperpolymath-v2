/**
 * /design: the living style guide.
 *
 * Public, unauthenticated reference for the `--sd-*` register documented in
 * `docs/DESIGN-SYSTEM.md`. Swatches, pills, and card recipes consume the
 * shipped `.sd-*` utilities and `components/lifeos/entity-card` primitives
 * directly, so those samples can never drift from the implementation.
 *
 * The sidebar row sample is the one hand-rendered block: importing the real
 * `Sidebar` would drag auth and Supabase into this public page. Its class
 * strings are copied verbatim from the `SB_*` constants and must stay in sync.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Plus, Search } from "lucide-react";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { Logotype } from "@/components/ui/Logotype";
import {
  CaptureIcon,
  FolderIcon,
  HabitIcon,
  TaskIcon,
  WidgetIcon,
} from "@/components/ui/icons";
import {
  ActionLink,
  Chip,
  ChipRow,
  EntityCardHeader,
  MetaRow,
  OverflowChip,
  ProgressRow,
  StatusPill,
} from "@/components/lifeos/entity-card";
import { WidgetBody, WidgetCard, WidgetFooter } from "@/components/lifeos/WidgetCard";
import { TokenLadder } from "./TokenSwatches";

export const metadata: Metadata = {
  title: "Design System · Hyperpolymath",
  description:
    "The living reference for Hyperpolymath's --sd-* register: tokens, typography, sidebar and card grammar, motion law, and icons, rendered from the shipped implementation.",
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
          className="mt-2 text-[22px] font-semibold text-[var(--sd-ink)]"
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

/** A labelled sample frame. The label is the rule; the frame is the proof. */
function Specimen({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={`flex items-center rounded-[10px] border p-4 ${className ?? ""}`}
        style={{ background: "var(--sd-app)", borderColor: "var(--sd-line)" }}
      >
        {children}
      </div>
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
        {label}
      </span>
    </div>
  );
}

const RADII = [
  { label: "sidebar + menu rows, buttons", px: 6 },
  { label: "tiles, icon buttons, tree chips", px: 8 },
  { label: "workspace pill, inset sub-cards", px: 10 },
  { label: "panels, mini entity cards", px: 12 },
  { label: "widget cards", px: 14 },
  { label: "pills", px: 9999 },
];

const MOTION_LAW = [
  { moment: "Entrances", timing: "opacity 0→1, y 4→0, 160ms", easing: "[0.25, 1, 0.5, 1]" },
  {
    moment: "Collapses (height 0↔auto)",
    timing: "200-320ms",
    easing: "cubic-bezier(0.32, 0.72, 0, 1)",
  },
  { moment: "Micro (color / bg / border)", timing: "120-150ms", easing: "ease-out" },
  { moment: "Tab switch (color only)", timing: "80ms", easing: "ease-out" },
  { moment: "Sidebar (width, active pill)", timing: "250-300ms", easing: "[0.25, 1, 0.5, 1]" },
  { moment: "Press", timing: "transform 100ms", easing: "ease-out" },
  { moment: "Success / confirm overshoot", timing: "~4% spring", easing: "spring" },
];

const BANNED = [
  "Gradient washes",
  "Noise on content",
  "Orbs > 40px",
  "Serif beyond the logotype",
  "Glow rings",
  "Card glassmorphism",
  "Accent-filled rows",
  "Hover scales",
  "Hover fill on nav rows",
  "Italic serif empty states",
  "More than one accent hue",
  "width-animated progress",
];

/**
 * Verbatim from the `SB_*` constants in `components/shell/Sidebar.tsx`.
 * Rows take NO hover fill: hover moves ink-dull → ink and nothing else.
 * ACTIVE is a background tint only.
 */
const SB_ROW =
  "flex h-8 w-full items-center rounded-[6px] px-2 text-sm font-medium tracking-wide transition-colors duration-[120ms] ease-out";
const SB_ROW_IDLE = "text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]";
const SB_ROW_ACTIVE =
  "bg-[color-mix(in_oklch,var(--sd-selected)_40%,transparent)] text-[var(--sd-ink)]";

function SidebarSpecimen() {
  return (
    <div
      className="flex w-[230px] flex-col gap-2.5 rounded-[10px] border p-2.5"
      style={{ background: "var(--sd-sidebar)", borderColor: "var(--sd-line)" }}
    >
      {/* Workspace pill */}
      <div
        className="flex h-9 w-full shrink-0 items-center gap-2 rounded-[10px] px-3 border"
        style={{
          background: "var(--sd-box)",
          borderColor: "color-mix(in oklch, var(--sd-line) 50%, transparent)",
        }}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: "var(--hud-cyan)" }}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-left text-[15px] leading-none">
          <Logotype />
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        {/* Noun destination, active: dimensional icon at 18px, bg tint only */}
        <div className={`${SB_ROW} ${SB_ROW_ACTIVE}`}>
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
            <WidgetIcon size={18} />
          </span>
          <span className="ml-2 flex-1 truncate">Life OS</span>
        </div>

        {/* Noun destination, idle */}
        <div className={`${SB_ROW} ${SB_ROW_IDLE}`}>
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
            <TaskIcon size={18} />
          </span>
          <span className="ml-2 flex-1 truncate">Tasks</span>
        </div>

        {/* Verb row: quiet lucide at 16px, stroke 1.75 */}
        <div className={`${SB_ROW} ${SB_ROW_IDLE}`}>
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
            <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <span className="ml-2 flex-1 truncate">Search</span>
        </div>

        {/* Disabled + SOON chip */}
        <div className={`${SB_ROW} cursor-not-allowed text-[var(--sd-ink-dull)] opacity-40`}>
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
            <HabitIcon size={18} />
          </span>
          <span className="ml-2 flex-1 truncate">Nutrition</span>
          <span className="flex h-[18px] shrink-0 items-center rounded-[5px] bg-[var(--sd-box)] px-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
            Soon
          </span>
        </div>
      </div>

      {/* Section header + count badge + hover-reveal action */}
      <div className="group/section mb-1 mt-2 flex h-6 items-center gap-1.5 px-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
          Areas
        </span>
        <span className="flex h-[19px] min-w-[20px] items-center justify-center rounded-full border border-[color-mix(in_oklch,var(--sd-line)_40%,transparent)] px-1 text-[9px] font-medium tabular-nums text-[var(--sd-ink-faint)]">
          4
        </span>
        <span className="ml-auto inline-flex h-5 w-5 items-center justify-center rounded-[6px] text-[var(--sd-ink-dull)] opacity-30 duration-300">
          <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

const STATS = [
  {
    Icon: TaskIcon,
    label: "Open tasks",
    value: "12",
    unit: null,
    caption: "2 overdue",
    dot: "var(--ink-coral)",
  },
  {
    Icon: HabitIcon,
    label: "Habits today",
    value: "3",
    unit: "/ 5",
    caption: "On pace",
    dot: "var(--ink-sage)",
  },
  {
    Icon: CaptureIcon,
    label: "Captures",
    value: "27",
    unit: null,
    caption: "8 this week",
    dot: "var(--sd-accent)",
  },
];

function StatStripSpecimen() {
  return (
    <div className="grid max-w-[1200px] grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3">
      {STATS.map(({ Icon, label, value, unit, caption, dot }) => (
        <div key={label} className="group/stat flex items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center">
            <Icon size={40} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sd-ink-faint)]">
              {label}
            </p>
            <p className="flex items-baseline leading-none">
              <span className="text-2xl font-black tabular-nums tracking-[-0.01em] text-[var(--sd-ink)]">
                {value}
              </span>
              {unit ? (
                <span className="ml-1 text-[16px] font-medium tabular-nums text-[var(--sd-ink-faint)]">
                  {unit}
                </span>
              ) : null}
            </p>
            <p className="mt-1 flex items-center gap-1.5 truncate text-[12px] text-[var(--sd-ink-dull)]">
              <span
                className="size-[5px] shrink-0 rounded-full"
                style={{ backgroundColor: dot }}
                aria-hidden="true"
              />
              {caption}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

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
              className="mt-3 text-[32px] font-semibold text-[var(--sd-ink)]"
              style={{ letterSpacing: "-0.02em" }}
            >
              Design System
            </h1>
            <p className="mt-2 text-[15px] text-[var(--sd-ink-dull)] max-w-[640px]">
              "Spacedrive × Raycast × Renaissance." One chrome dialect app-wide: full structural
              commitment, zero theatrics. Rendered live from the shipped tokens, utilities, and
              primitives below, so this page can never drift from the implementation.
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
          eyebrow="§ 01 · TYPOGRAPHY"
          title="Space Grotesk, and one serif"
          caption="Space Grotesk is the app-wide sans. EB Garamond survives in exactly one place: the logotype. JetBrains Mono is for micro-labels only, never as a UI font. The --font-serif token is a dead alias pointing at Space Grotesk; never add a new font-serif class."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Specimen label="--font-sans · Space Grotesk · app-wide">
              <div>
                <p
                  className="text-[26px] font-semibold text-[var(--sd-ink)]"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  Burning late<span className="text-[var(--sd-accent)]">.</span>
                </p>
                <p className="mt-1 text-[13px] text-[var(--sd-ink-dull)]">400 · 500 · 600 · 700</p>
              </div>
            </Specimen>
            <Specimen label="--font-logotype · EB Garamond · logotype ONLY">
              <div>
                <p className="text-[26px] leading-none">
                  <Logotype />
                </p>
                <p className="mt-2 text-[13px] text-[var(--sd-ink-dull)]">
                  components/ui/Logotype
                </p>
              </div>
            </Specimen>
            <Specimen label="--font-mono · JetBrains Mono · micro-labels">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
                  Monday · July 13, 2026
                </p>
                <p className="mt-2 font-mono text-[11px] text-[var(--sd-ink-dull)]">
                  ⌃1 · dates · kbd · eyebrows
                </p>
              </div>
            </Specimen>
          </div>
        </Section>

        <Section
          eyebrow="§ 02 · TOKENS"
          title="Tokens"
          caption="globals.css is the source of truth. Values below are read live off <html>. Toggle the theme switch above to see both ladders resolve. No new hex literals in components."
        >
          <TokenLadder />
        </Section>

        <Section
          eyebrow="§ 03 · CHROME GRAMMAR"
          title="Radius ladder"
          caption="Deliberate, not a free choice. 14px is the one step above 12px, and it is what makes widget cards read as the app's primary object."
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-[10px] text-[var(--sd-ink-dull)]">
                    {radius.px === 9999 ? "full" : `${radius.px}px`}
                  </span>
                  <span className="font-mono text-[9px] leading-tight text-[var(--sd-ink-faint)]">
                    {radius.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="§ 04 · SIDEBAR"
          title="Sidebar row grammar"
          caption="230px, solid --sd-sidebar. Rows take NO hover fill: hover moves ink-dull → ink and nothing else, and ACTIVE is a background tint only (no left bar, no cyan tint). Nouns get dimensional icons at 18px; verbs get quiet lucide at 16px."
        >
          <SidebarSpecimen />
        </Section>

        <Section
          eyebrow="§ 05 · STAT STRIP"
          title="Icon-left stat strip"
          caption="Sits directly on the canvas: no card chrome, no hero plate. The label is Space Grotesk 11px semibold uppercase, NOT mono. Functional hues appear only as the 5px caption dot."
        >
          <StatStripSpecimen />
        </Section>

        <Section
          eyebrow="§ 06 · WIDGET CARD v2"
          title="The canonical content object"
          caption="Rendered from the real WidgetCard and entity-card primitives. 14px radius, --sd-box fill, hairline border, 20px body, and chips in a hairline-separated h-10 footer strip rather than floating mid-card. Hover moves the border and nothing else."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <WidgetCard href="/design" ariaLabel="Widget card sample">
              <WidgetBody>
                <EntityCardHeader
                  icon={<TaskIcon size={36} />}
                  title="Tasks"
                  subtitle="Today"
                  pill={<StatusPill tone="danger" label="2 overdue" />}
                  action={<ActionLink>All →</ActionLink>}
                />
                <div className="mt-3">
                  <MetaRow label="Done today" value="4 / 9" />
                  <ProgressRow label="Progress" value="44%" ratio={0.44} />
                </div>
              </WidgetBody>
              <WidgetFooter>
                <ChipRow>
                  <Chip>Deep work</Chip>
                  <Chip tone="var(--ink-coral)">Overdue</Chip>
                  <OverflowChip count={3} />
                </ChipRow>
              </WidgetFooter>
            </WidgetCard>

            <WidgetCard href="/design" ariaLabel="Habits card sample">
              <WidgetBody>
                <EntityCardHeader
                  icon={<HabitIcon size={36} />}
                  title="Habits"
                  subtitle="3 of 5 done"
                  pill={<StatusPill tone="active" label="On pace" />}
                />
                <div className="mt-3">
                  <MetaRow label="Streak" value="12 days" />
                  <ProgressRow label="Today" value="3 / 5" ratio={0.6} />
                </div>
              </WidgetBody>
              <WidgetFooter>
                <ChipRow>
                  <Chip tone="var(--hud-cyan)">Morning</Chip>
                  <Chip>Reading</Chip>
                </ChipRow>
              </WidgetFooter>
            </WidgetCard>
          </div>
        </Section>

        <Section
          eyebrow="§ 07 · CHIPS + PILLS"
          title="One chip grammar"
          caption="The verbatim chip is text-tiny (0.65rem), 4px radius, hairline border. A tone tints it: text in the hue, border at 30%, background at 15%. Only cyan and coral are sanctioned. StatusPill is canonical inside cards; the CSS .sd-status-pill is its standalone equivalent for surfaces that are not entity cards."
        >
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Chip>Quiet</Chip>
              <Chip tone="var(--hud-cyan)">Accent</Chip>
              <Chip tone="var(--ink-coral)">Danger</Chip>
              <OverflowChip count={4} />
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
                Chip · OverflowChip
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill tone="active" label="Active" />
              <StatusPill tone="progress" label="4 / 9" />
              <StatusPill tone="idle" label="Idle" />
              <StatusPill tone="danger" label="2 overdue" />
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
                StatusPill · canonical in cards
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
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
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
                .sd-status-pill · CSS-only surfaces
              </span>
            </div>
          </div>
        </Section>

        <Section
          eyebrow="§ 08 · BUTTONS"
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
          eyebrow="§ 09 · MOTION LAW"
          title="Motion timings"
          caption="The zero-jank law: animate opacity, transform, and filter only. Never width, never height outside a measured collapse. Everything interruptible, useReducedMotion() guarded, no transitions on first paint, no hover scale anywhere."
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
          eyebrow="§ 10 · ICONS"
          title="Dimensional icons"
          caption="Nouns get dimensional icons; verbs get lucide. Gradient-layered, cool-indigo bodies with useId-scoped defs. Accent is never a body fill. They must hold legibility at 18px (the sidebar floor)."
        >
          <div className="flex flex-wrap gap-10">
            {[
              { name: "TaskIcon", Icon: TaskIcon },
              { name: "FolderIcon", Icon: FolderIcon },
              { name: "WidgetIcon", Icon: WidgetIcon },
              { name: "CaptureIcon", Icon: CaptureIcon },
            ].map(({ name, Icon }) => (
              <div key={name} className="flex flex-col items-center gap-3">
                <div className="flex items-end gap-4">
                  <Icon size={18} title={name} />
                  <Icon size={36} title={name} />
                  <Icon size={48} title={name} />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--sd-ink-faint)]">
                  {name} · 18 / 36 / 48px
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="§ 11 · BANNED"
          title="What never ships"
          caption="If a change needs one of these to work, the change is wrong. Amend docs/DESIGN-SYSTEM.md first, never silently."
        >
          <ul className="flex flex-wrap gap-2">
            {BANNED.map((item) => (
              <li
                key={item}
                className="inline-flex items-center rounded border px-2 py-1 text-[12px] font-medium text-[var(--sd-ink-dull)]"
                style={{
                  background: "color-mix(in srgb, var(--ink-coral) 8%, var(--sd-box))",
                  borderColor: "color-mix(in srgb, var(--ink-coral) 25%, var(--sd-line))",
                }}
              >
                {item}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </main>
  );
}
