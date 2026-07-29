"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * EmptyState — the one empty state in the app (SDC-1 §2.10).
 *
 * It consolidates the three that grew independently: the serif `py-24` one in
 * `components/shared/EmptyState.tsx`, the sans icon-slot one in
 * `components/ui/explorer/EmptyState.tsx`, and the inline one in
 * `components/lifeos/entity-card.tsx`. The first two are now thin shims over
 * this component, so their existing call sites keep compiling while the visual
 * register converges.
 *
 * The anatomy is fixed and deliberately unparameterised: centred, `gap-3`,
 * `text-center`, no border, no card, no background, no serif, no italic, no
 * uppercase. The only axis is `size`, and it only changes vertical breathing
 * room (plus the demotion `inline` makes to fit inside a card).
 *
 * This file is U0-owned and frozen for wave 2. If it cannot express an empty
 * state you need, that is a blocker for U0, not an edit.
 */

export type EmptyStateProps = {
  /** Dimensional icon (nouns only). Rendered at 40px, 40% opacity. Omitted at `inline`. */
  icon?: ReactNode;
  /** Sentence case. `text-subtitle` in --ink, or `text-meta` in --ink-faint at `inline`. */
  title: string;
  /** One or two sentences. `text-meta` in --ink-muted, capped at 46ch. */
  description?: string;
  /** Exactly one ghost-variant button. Ignored at `inline`. */
  action?: { label: string; onClick: () => void };
  /**
   * Legacy escape hatch for the explorer shim, whose old prop type accepted an
   * arbitrary node where `action` sits (it ships two buttons side by side).
   * Not for new code: use `action`.
   */
  actionSlot?: ReactNode;
  size?: "page" | "section" | "inline";
  className?: string;
};

const PAD: Record<NonNullable<EmptyStateProps["size"]>, string> = {
  page: "py-24",
  section: "py-16",
  inline: "py-8",
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  actionSlot,
  size = "section",
  className,
}: EmptyStateProps) {
  const reduceMotion = useReducedMotion();
  const inline = size === "inline";

  return (
    <motion.div
      role="status"
      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 text-center",
        PAD[size],
        className
      )}
    >
      {icon && !inline ? (
        // jul-29 craft restyle: the icon sits on a soft circular pastel
        // plate. Neutral by default; a caller can pass a `tint-*` class via
        // className to give a feature its hue.
        <div className="flex size-14 items-center justify-center rounded-full bg-[var(--tint-bg,var(--hover))] text-[var(--tint-ink,var(--ink-muted))] [&_svg]:size-6">
          {icon}
        </div>
      ) : null}

      {inline ? (
        <p className="text-meta text-[var(--ink-faint)]">{title}</p>
      ) : (
        <p className="text-subtitle font-medium text-[var(--ink)]">{title}</p>
      )}

      {description ? (
        <p className="max-w-[46ch] text-meta text-[var(--ink-muted)]">{description}</p>
      ) : null}

      {!inline && action ? (
        <Button variant="ghost" size="sm" onClick={action.onClick} className="mt-1">
          {action.label}
        </Button>
      ) : null}

      {!inline && actionSlot ? (
        <div className="mt-1 flex items-center justify-center gap-2">{actionSlot}</div>
      ) : null}
    </motion.div>
  );
}
