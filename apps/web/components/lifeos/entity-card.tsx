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
 * The one quiet status pill (SDC-1 §2.9): rounded-full, `--sd-input` fill,
 * `--sd-line` hairline, 6px dot + micro label. Sans, sentence case, no mono.
 */
export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-[var(--sd-line)] bg-[var(--sd-input)] px-2 text-micro font-medium text-[var(--sd-ink-dull)]">
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

/** Micro verb, sentence case (SDC-1 §2.4 bans uppercase), ink-faint → ink on hover. */
export function ActionLink({ children }: { children: ReactNode }) {
  return (
    <span className="text-micro font-medium text-[var(--sd-ink-faint)] transition-colors duration-[160ms] group-hover/action:text-[var(--sd-ink)]">
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
  /** Dimensional icon (20px, craft scale) — the register's mascots (R3). */
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  pill?: ReactNode;
  /** Trailing affordance ("ALL →"), stacked under the pill. */
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex shrink-0 items-center justify-center">{icon}</span>
        <div className="flex min-w-0 flex-col gap-0.5">
          {/* aug-05 quiet pass: Craft card titles are ~13px SEMIBOLD ink with
              faint metadata under them — weight carries hierarchy, not size. */}
          <h3 className="truncate text-meta font-semibold leading-tight text-[var(--sd-ink)]">
            {title}
          </h3>
          {subtitle != null && (
            <div className="truncate text-micro font-normal text-[var(--sd-ink-faint)]">
              {subtitle}
            </div>
          )}
        </div>
      </div>
      {(pill != null || action != null) && (
        // In a narrow /widget tile the trailing column gives way so the title
        // never truncates to a couple of characters; outside a /widget
        // container (e.g. /design) the query can't match and it stays visible.
        <div className="flex shrink-0 flex-col items-end gap-1 @max-[15rem]/widget:hidden">
          {pill}
          {action}
        </div>
      )}
    </header>
  );
}

/* ---------------------------------------------------------------- meta rows */

/** Label text-meta ink-dull left ←→ value text-meta ink right. */
export function MetaRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[3px]">
      <span className="min-w-0 truncate text-meta text-[var(--sd-ink-dull)]">{label}</span>
      <span className="shrink-0 text-meta tabular-nums text-[var(--sd-ink)]">{value}</span>
    </div>
  );
}

/** §6: 1px `--sd-line`/60 hairline where header/body separation needs it. */
export function CardDivider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "my-3 h-px w-full bg-[color-mix(in_srgb,var(--sd-line)_60%,transparent)]",
        className,
      )}
    />
  );
}

/* ----------------------------------------------------------- progress row */

/**
 * Quiet progress (aug-05 craft pass): a 3px track (`--sd-input`), accent fill,
 * and a 45° hatched projected segment. The label/value line rides micro faint —
 * progress is ambient information, not a headline. The fill animates on
 * transform:scaleX only — never width (zero jank).
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
      <div className="flex items-center justify-between gap-3">
        <span className="text-micro text-[var(--sd-ink-faint)]">{label}</span>
        <span className="text-micro tabular-nums text-[var(--sd-ink-dull)]">{value}</span>
      </div>
      <div className="relative h-[3px] overflow-hidden rounded-full bg-[var(--sd-input)]">
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
 * Chip: borderless (SDC-1 §2.6 — one border per nesting level; chips live
 * inside bordered cards), 4px radius, `--hover` fill, micro type. `tone` swaps
 * in a 12%-alpha functional tint for priority/urgency.
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
        "inline-flex max-w-full items-center gap-1 rounded bg-[var(--hover)] px-1.5 py-[1px] text-micro font-medium text-[var(--sd-ink-dull)]",
        className,
      )}
      style={
        tone
          ? {
              color: tone,
              background: `color-mix(in srgb, ${tone} 12%, var(--hover))`,
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
    <span className="inline-flex items-center rounded bg-[var(--hover)] px-1.5 py-[1px] text-micro font-medium tabular-nums text-[var(--sd-ink-faint)]">
      +{count} more
    </span>
  );
}

/** Wrapping chip row for chips that live inside a body (e.g. capture sub-cards). */
export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/* -------------------------------------------------------------- empty state */

/**
 * Legacy shim over the §2.10 inline anatomy for the two call sites outside
 * /lifeos (HabitsClient, NutritionDayView). New code uses
 * `components/ui/EmptyState` with `size="inline"` directly; the icon prop is
 * accepted for compatibility and dropped, exactly as the inline size drops it.
 */
export function EmptyState({ children }: { icon?: ReactNode; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      role="status"
      initial={reduced ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
      className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center"
    >
      <p className="text-meta text-[var(--ink-faint)]">{children}</p>
    </motion.div>
  );
}
