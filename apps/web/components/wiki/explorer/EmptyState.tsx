"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-[240px] flex-col items-center justify-center px-6 py-10 text-center", className)}>
      {icon ? <div className="mb-4">{icon}</div> : null}
      <h2 className="max-w-md font-serif text-2xl leading-tight text-[var(--ink)]">{title}</h2>
      {description ? <p className="mt-2 max-w-sm font-sans text-sm leading-6 text-[var(--ink-muted)]">{description}</p> : null}
      {action ? <div className="mt-5 flex items-center justify-center gap-2 font-sans">{action}</div> : null}
    </div>
  );
}
