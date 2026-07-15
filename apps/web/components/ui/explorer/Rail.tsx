"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Collapsible explorer rail shell: a labelled section with a header toggle
 * (chevron + icon + title + optional count), an optional right-aligned
 * accessory shown only when expanded, and an AnimatePresence height-auto
 * collapse of its body on the campaign's `[0.32,0.72,0,1]` curve with a
 * `useReducedMotion` guard.
 *
 * Controlled and presentational: the consumer owns collapse state (and any
 * persistence/hydration) plus the body content. `hydrated` gates the body so a
 * consumer reconciling a persisted collapse state after mount avoids an
 * SSR/CSR mismatch while still animating the body in once it settles.
 */
export function Rail({
  label,
  icon,
  title,
  count,
  collapsed,
  onToggleCollapsed,
  hydrated = true,
  headerAccessory,
  bodyId,
  children,
  className,
}: {
  label: string;
  icon?: ReactNode;
  title: ReactNode;
  count?: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  hydrated?: boolean;
  headerAccessory?: ReactNode;
  bodyId?: string;
  children: ReactNode;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section aria-label={label} className={cn("flex flex-col gap-2", className)}>
      <div
        className={cn(
          "flex items-center justify-between gap-2",
          collapsed && "h-8 rounded-[8px] border border-[var(--sd-line)] bg-[var(--sd-box)] px-2"
        )}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] px-1.5 text-left hover:bg-[var(--sd-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
        >
          <span className="flex-shrink-0 text-[var(--sd-ink-faint)]">
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </span>
          {icon}
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--sd-ink-dull)]">
            {title}
          </span>
          {count != null ? (
            <span className="font-mono text-[0.65rem] tabular-nums text-[var(--sd-ink-faint)]">
              {count}
            </span>
          ) : null}
        </button>
        {!collapsed ? headerAccessory : null}
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && hydrated && (
          <motion.div
            id={bodyId}
            key="rail-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.16, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
