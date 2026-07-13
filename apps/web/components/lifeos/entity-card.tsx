"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Entity-card grammar — the Spacedrive "Overview" device-card anatomy adapted
 * to Life OS (design constitution §A2, decisions D2/D6/D7).
 *
 * These are the shared primitives every /lifeos widget composes: a header with
 * a dimensional icon backplate + title + one-line subtitle + right-aligned
 * status pill, an optional labeled progress row with a solid accent fill and a
 * 45deg hatched projected segment, and rounded chip pills with a "+N more"
 * overflow.
 *
 * Everything is token-driven (--hud-cyan is the app accent per D1b; chrome via
 * --canvas/--surface/--surface-raised/--ink/--ink-muted/--edge) so both themes
 * flip automatically (D1c) and no globals.css changes are needed. Accent stays
 * cyan; functional hues (green/amber/coral) appear only as 6px status dots and
 * 15%-alpha tinted chips, never as chrome (D6).
 */

/* --------------------------------------------------------------- status pill */

export type StatusTone = "active" | "progress" | "idle";

const statusDot: Record<StatusTone, string> = {
  active: "var(--ink-sage)", // green — active / done-today
  progress: "var(--hud-cyan)", // cyan — in-progress / synced
  idle: "var(--ink-muted)", // gray — idle / empty
};

const statusGlow: Record<StatusTone, string | undefined> = {
  active: "0 0 5px color-mix(in oklch, var(--ink-sage) 45%, transparent)",
  progress: "0 0 5px color-mix(in oklch, var(--hud-cyan) 55%, transparent)",
  idle: undefined,
};

export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--edge)] bg-[color-mix(in_oklch,var(--surface-raised)_70%,transparent)] px-2 py-[3px]">
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: statusDot[tone], boxShadow: statusGlow[tone] }}
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] tabular-nums text-[var(--ink-muted)]">
        {label}
      </span>
    </span>
  );
}

/* --------------------------------------------------------- icon backplate */

/**
 * Dimensional icon backplate — a subtle raised tile that seats a widget's
 * glyph. The gradient + inset top hairline give the flat lucide icon the
 * dimensional read the reference calls for, without the (not-yet-extracted)
 * components/ui/icons SVG set. 8px radius per D7.
 */
export function IconBackplate({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]"
      style={{
        background:
          "linear-gradient(160deg, color-mix(in oklch, var(--surface-raised) 90%, transparent), color-mix(in oklch, var(--surface) 88%, var(--ink)))",
        border: "1px solid var(--edge)",
        boxShadow:
          "inset 0 1px 0 rgb(255 255 255 / 0.10), 0 1px 2px color-mix(in oklch, var(--ink) 8%, transparent)",
      }}
    >
      {children}
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
        <IconBackplate>{icon}</IconBackplate>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate font-serif text-base font-medium leading-tight text-[var(--ink)]">
            {title}
          </h3>
          {subtitle != null && (
            <div className="truncate text-[12px] leading-tight text-[var(--ink-muted)]">
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
 * Labeled progress row. The filled portion is a solid cyan bar; the projected
 * / remaining portion shows a 45deg hatched cyan segment beneath it. The fill
 * animates via transform:scaleX (GPU-safe, D1d) — never width tweening.
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
        <span className="text-sm text-[var(--ink-muted)]">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">
          {value}
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_oklch,var(--ink)_9%,transparent)]">
        {/* Projected / remaining — hatched cyan under the solid fill. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, color-mix(in oklch, var(--hud-cyan) 24%, transparent) 0 3px, transparent 3px 7px)",
          }}
        />
        {/* Solid fill — left-anchored scaleX so it clips the hatch where done. */}
        <motion.div
          aria-hidden
          className="absolute inset-y-0 left-0 w-full origin-left"
          style={{
            background: "var(--hud-cyan)",
            boxShadow:
              clamped > 0
                ? "0 0 6px color-mix(in oklch, var(--hud-cyan) 40%, transparent)"
                : undefined,
          }}
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
        "inline-flex max-w-full items-center gap-1 rounded-md border border-[var(--edge)] bg-[color-mix(in_oklch,var(--surface-raised)_60%,transparent)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.10em] text-[var(--ink-muted)]",
        className,
      )}
      style={
        tone
          ? {
              color: tone,
              borderColor: `color-mix(in oklch, ${tone} 30%, var(--edge))`,
              background: `color-mix(in oklch, ${tone} 15%, transparent)`,
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
    <span className="inline-flex items-center rounded-md border border-[var(--edge)] bg-[color-mix(in_oklch,var(--surface-raised)_60%,transparent)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums tracking-[0.10em] text-[var(--ink-muted)]">
      +{count} more
    </span>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}
