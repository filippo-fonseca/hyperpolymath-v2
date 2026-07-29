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
            "flex h-full w-[260px] shrink-0 flex-col border-l border-[var(--sd-line)] bg-[var(--sd-app)] font-sans text-meta text-[var(--sd-ink)]",
            className
          )}
        >
          {header ? (
            <div className="border-b border-[var(--sd-line)] px-4 py-3">{header}</div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
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
    <section className={cn("space-y-1 px-4 py-2", className)}>
      {title ? <h3 className="text-micro font-medium text-[var(--sd-ink-dull)]">{title}</h3> : null}
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
    <div
      className={cn(
        "flex min-h-6 items-center gap-3 text-micro text-[var(--sd-ink-dull)]",
        className
      )}
    >
      <div className="flex-1 whitespace-nowrap">{label}</div>
      <div className="min-w-0 max-w-[130px] truncate text-right text-[var(--sd-ink)]">{value}</div>
    </div>
  );
}
