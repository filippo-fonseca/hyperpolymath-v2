"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Entity-card grammar — the Spacedrive "Overview" device-card anatomy adapted
 * to Life OS (design constitution §A2, decisions D2/D6/D7).
 *
 * These primitives compose the foundations panel-grammar utilities shipped by
 * the sd-campaign block in globals.css (`.sd-status-pill`, `.sd-dot-*`,
 * `.sd-progress` / `.sd-progress-fill` / `.sd-progress-hatched`) rather than
 * re-declaring the CSS locally. Everything resolves through the promoted
 * `--sd-*` ladder (accent = JARVIS cyan per D1b; surfaces map to the parchment
 * neutrals in light scope per the D11 promotion) so both themes flip
 * automatically (D1c). Functional hues appear only as 6px status dots and
 * 15%-alpha tinted chips, never as chrome (D6).
 */

/* --------------------------------------------------------------- status pill */

export type StatusTone = "active" | "progress" | "idle";

/** Maps a semantic tone to the foundations dot utility. */
const statusDotClass: Record<StatusTone, string> = {
  active: "sd-dot-active", // green — active / done-today
  progress: "sd-dot-synced", // accent cyan — in-progress / synced
  idle: "sd-dot-idle", // faint — idle / empty
};

export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className="sd-status-pill font-mono uppercase tracking-[0.12em] tabular-nums">
      <span aria-hidden className={cn("sd-dot", statusDotClass[tone])} />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------ card header */

export function EntityCardHeader({
  icon,
  title,
  subtitle,
  pill,
  action,
}: {
  /** Dimensional icon from components/ui/icons (carries its own depth). */
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  pill?: ReactNode;
  /** Trailing lifeos affordance (e.g. the "All →" link). */
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="inline-flex shrink-0 items-center justify-center">{icon}</span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate font-serif text-base font-medium leading-tight text-[var(--sd-ink)]">
            {title}
          </h3>
          {subtitle != null && (
            <div className="truncate text-[12px] leading-tight text-[var(--sd-ink-dull)]">
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {(pill != null || action != null) && (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {pill}
          {action}
        </div>
      )}
    </header>
  );
}

/* ----------------------------------------------------------- progress row */

/**
 * Labeled progress row. The track shows a 45deg hatched cyan projected segment
 * (`.sd-progress-hatched`) beneath a solid cyan fill (`.sd-progress-fill`); the
 * fill animates via transform:scaleX (GPU-safe, D1d) — never width tweening.
 */
export function ProgressRow({
  label,
  value,
  ratio,
}: {
  label: string;
  value: string;
  ratio: number;
}) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-[var(--sd-ink-dull)]">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-[var(--sd-ink)]">
          {value}
        </span>
      </div>
      <div className="sd-progress relative">
        {/* Projected / remaining — hatched cyan under the solid fill. */}
        <div aria-hidden className="sd-progress-hatched absolute inset-0" />
        {/* Solid fill — left-anchored scaleX so it clips the hatch where done. */}
        <motion.div
          aria-hidden
          className="sd-progress-fill absolute inset-y-0 left-0 w-full origin-left"
          initial={reduced ? false : { scaleX: 0 }}
          animate={{ scaleX: clamped }}
          transition={
            reduced ? { duration: 0 } : { duration: 0.5, ease: [0.25, 1, 0.5, 1] }
          }
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- chip + row */

export function Chip({
  icon,
  children,
  /** Functional hue for a 15%-alpha tinted chip (priority/urgency). */
  tone,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--sd-line)] bg-[color-mix(in_srgb,var(--sd-box)_60%,transparent)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.10em] text-[var(--sd-ink-dull)]",
        className,
      )}
      style={
        tone
          ? {
              color: tone,
              borderColor: `color-mix(in srgb, ${tone} 30%, var(--sd-line))`,
              background: `color-mix(in srgb, ${tone} 15%, var(--sd-box))`,
            }
          : undefined
      }
    >
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function OverflowChip({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--sd-line)] bg-[color-mix(in_srgb,var(--sd-box)_60%,transparent)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums tracking-[0.10em] text-[var(--sd-ink-dull)]">
      +{count} more
    </span>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}
