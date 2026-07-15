"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Entity-card grammar v2 — UI-CONTRACT §6 (widget card anatomy) + §11 (verbatim
 * Spacedrive source addendum).
 *
 * The card is a real surface, not a tinted region: `--sd-box` fill, 14px radius,
 * a 1px hairline border, and a white inset top hairline that catches the light.
 * Everything below composes that surface — header (36px dimensional icon, title,
 * status pill), label/value meta rows, hatched progress, and a hairline-separated
 * FOOTER CHIP STRIP (§11) where chips live instead of floating mid-card.
 *
 * Chrome rules that are load-bearing: no backdrop blur, no gradient, no glow, no
 * hover scale. Hover moves the border and nothing else. Typography is Space
 * Grotesk throughout (R2) — mono survives only for tabular micro-values.
 */

/* -------------------------------------------------------------- status pill */

export type StatusTone = "active" | "progress" | "idle" | "danger";

/**
 * Functional hue per tone — cyan = count/active, coral = danger, gray = idle.
 * §9 permits one accent hue, so "active" rides the accent rather than sage.
 */
const toneDot: Record<StatusTone, string> = {
  active: "var(--sd-accent)",
  progress: "var(--sd-accent)",
  idle: "var(--sd-ink-faint)",
  danger: "var(--ink-coral)",
};

/**
 * §6: h-24px rounded-full, `--sd-input` fill, `--sd-line` border, px-10px,
 * 6px dot + 11px medium tracking-wide label. Sans, not mono.
 */
export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-[var(--sd-line)] bg-[var(--sd-input)] px-2.5 text-[11px] font-medium tracking-wide text-[var(--sd-ink-dull)]">
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: toneDot[tone] }}
      />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------- action link */

/** §6: 11px semibold uppercase tracking-wide, ink-faint → ink on hover. */
export function ActionLink({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sd-ink-faint)] transition-colors duration-100 group-hover/action:text-[var(--sd-ink)]">
      {children}
    </span>
  );
}

/* ------------------------------------------------------------- card header */

export function EntityCardHeader({
  icon,
  title,
  subtitle,
  pill,
  action,
}: {
  /** Dimensional icon (36px per §6) — the register's mascots (R3). */
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  pill?: ReactNode;
  /** Trailing affordance ("ALL →"), stacked under the pill. */
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex shrink-0 items-center justify-center">{icon}</span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate text-[15px] font-semibold leading-tight tracking-[-0.01em] text-[var(--sd-ink)]">
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

/* ---------------------------------------------------------------- meta rows */

/** §6: label 13px ink-dull left ←→ value 13px ink right. */
export function MetaRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[3px]">
      <span className="min-w-0 truncate text-[13px] text-[var(--sd-ink-dull)]">{label}</span>
      <span className="shrink-0 text-[13px] tabular-nums text-[var(--sd-ink)]">{value}</span>
    </div>
  );
}

/** §6: 1px `--sd-line`/60 hairline where header/body separation needs it. */
export function CardDivider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "my-3.5 h-px w-full bg-[color-mix(in_srgb,var(--sd-line)_60%,transparent)]",
        className,
      )}
    />
  );
}

/* ----------------------------------------------------------- progress row */

/**
 * §6: h-6px track (`--sd-input`), accent fill, and a 45° hatched projected
 * segment. The fill animates on transform:scaleX only — never width (zero jank).
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-[var(--sd-ink-dull)]">{label}</span>
        <span className="text-[13px] tabular-nums text-[var(--sd-ink)]">{value}</span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-[var(--sd-input)]">
        {/* Projected / remaining — hatched accent beneath the solid fill. */}
        <div aria-hidden className="sd-progress-hatched absolute inset-0" />
        <motion.div
          aria-hidden
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-[var(--sd-accent)]"
          initial={reduced ? false : { scaleX: 0 }}
          animate={{ scaleX: clamped }}
          transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- chip (Pill) */

/**
 * §11 verbatim Pill: `px-1.5 py-[1px] rounded text-tiny font-medium text-ink-dull
 * bg-app-box border border-app-line tracking-wide` (text-tiny = 0.65rem).
 * `tone` swaps in a 15%-alpha functional tint for priority/urgency.
 */
export function Chip({
  icon,
  children,
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
        "inline-flex max-w-full items-center gap-1 rounded border border-[var(--sd-line)] bg-[var(--sd-box)] px-1.5 py-[1px] text-[0.65rem] font-medium tracking-wide text-[var(--sd-ink-dull)]",
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

/** Same geometry as Chip, one step quieter (§6). */
export function OverflowChip({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center rounded border border-[var(--sd-line)] bg-[var(--sd-box)] px-1.5 py-[1px] text-[0.65rem] font-medium tabular-nums tracking-wide text-[var(--sd-ink-faint)]">
      +{count} more
    </span>
  );
}

/** Wrapping chip row for chips that live inside a body (e.g. capture sub-cards). */
export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}

/* -------------------------------------------------------------- empty state */

/**
 * §6: plain sans, never italic serif — 13px ink-faint copy above a dimensional
 * icon dimmed to 40%.
 */
export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-2.5 py-2">
      {icon != null && (
        <span aria-hidden className="inline-flex opacity-40">
          {icon}
        </span>
      )}
      <p className="text-[13px] text-[var(--sd-ink-faint)]">{children}</p>
    </div>
  );
}
