"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function InspectorShell({
  open,
  header,
  children,
  className,
}: {
  open: boolean;
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const shouldReduce = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.aside
          key="inspector"
          initial={shouldReduce ? false : { x: 24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={shouldReduce ? { opacity: 0 } : { x: 24, opacity: 0 }}
          transition={{
            duration: shouldReduce ? 0 : 0.22,
            ease: [0.32, 0.72, 0, 1],
          }}
          className={cn(
            "flex h-full w-[280px] shrink-0 flex-col border-l border-[var(--sd-line)] bg-[var(--sd-box)] font-sans text-[0.8rem] text-[var(--ink)]",
            "shadow-[-10px_0_24px_hsl(235_15%_0%_/_0.16)]",
            className,
          )}
        >
          {header ? <div className="border-b border-[var(--sd-line)] px-4 py-3">{header}</div> : null}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

export function MetaSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-1.5 py-2", className)}>
      {title ? <h3 className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-[var(--ink-muted)]">{title}</h3> : null}
      <div className="space-y-1">{children}</div>
    </section>
  );
}

export function MetaRow({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid min-h-7 grid-cols-[88px_1fr] items-center gap-3 rounded-[6px] px-2 py-1 hover:bg-[var(--sd-hover)]", className)}>
      <div className="font-mono text-[0.7rem] uppercase tracking-[0.07em] text-[var(--ink-muted)]">{label}</div>
      <div className="min-w-0 justify-self-end truncate text-right text-[0.78rem] text-[var(--ink)]">{value}</div>
    </div>
  );
}
