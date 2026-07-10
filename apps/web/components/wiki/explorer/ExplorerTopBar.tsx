"use client";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function ExplorerTopBar({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  breadcrumbs,
  search,
  controls,
  className,
}: {
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  breadcrumbs: ReactNode;
  search?: ReactNode;
  controls?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-12 items-center gap-2 border-b border-[var(--sd-divider)] bg-[var(--sd-darker-box)] px-3 font-sans text-[0.8rem] text-[var(--ink)]",
        "shadow-[0_1px_0_hsl(235_15%_100%_/_0.04)_inset]",
        className,
      )}
    >
      <div className="flex items-center gap-1">
        <ExplorerNavButton label="Back" disabled={!canGoBack} onClick={onBack}>
          <ChevronLeft size={16} strokeWidth={1.8} />
        </ExplorerNavButton>
        <ExplorerNavButton label="Forward" disabled={!canGoForward} onClick={onForward}>
          <ChevronRight size={16} strokeWidth={1.8} />
        </ExplorerNavButton>
      </div>
      <div className="min-w-0 flex-1">{breadcrumbs}</div>
      {search ? <div className="hidden min-w-[180px] max-w-[320px] flex-1 md:block">{search}</div> : null}
      {controls ? <div className="flex shrink-0 items-center gap-2">{controls}</div> : null}
    </div>
  );
}

function ExplorerNavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-[6px] border border-transparent text-[var(--ink-muted)]",
        "transition-[background-color,border-color,color] duration-[120ms] ease-out",
        "hover:border-[var(--sd-line)] hover:bg-[var(--sd-hover)] hover:text-[var(--ink)]",
        "disabled:pointer-events-none disabled:opacity-35",
      )}
    >
      {children}
    </button>
  );
}
