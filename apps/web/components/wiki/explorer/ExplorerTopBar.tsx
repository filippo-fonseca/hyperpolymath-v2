"use client";

import { Toolbar } from "@/components/ui/explorer";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Wiki explorer top bar. Thin wrapper over the shared {@link Toolbar} chrome:
 * it owns the wiki-specific navigation cluster (back/forward), and lays the
 * breadcrumbs, search, and controls into the toolbar's left/center/right
 * slots. The rendered DOM is identical to the pre-extraction bar.
 */
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
    <Toolbar
      className={className}
      left={
        <div className="flex items-center rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-box)]">
          <ExplorerNavButton side="left" label="Back" disabled={!canGoBack} onClick={onBack}>
            <ChevronLeft size={16} strokeWidth={1.8} />
          </ExplorerNavButton>
          <ExplorerNavButton
            side="right"
            label="Forward"
            disabled={!canGoForward}
            onClick={onForward}
          >
            <ChevronRight size={16} strokeWidth={1.8} />
          </ExplorerNavButton>
        </div>
      }
      center={
        <>
          <div className="min-w-0 flex-1">{breadcrumbs}</div>
          {search ? (
            <div className="hidden min-w-[180px] max-w-[320px] flex-1 md:block">{search}</div>
          ) : null}
        </>
      }
      right={controls ? <div className="flex shrink-0 items-center gap-2">{controls}</div> : null}
    />
  );
}

function ExplorerNavButton({
  label,
  disabled,
  onClick,
  children,
  side,
}: {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
  side: "left" | "right";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center text-[var(--sd-ink-dull)]",
        side === "left" ? "rounded-l-[5px] border-r border-r-[var(--sd-line)]" : "rounded-r-[5px]",
        "transition-[background-color,border-color,color] duration-[120ms] ease-out",
        "hover:border-[var(--sd-line)] hover:bg-[var(--sd-hover)] hover:text-[var(--ink)]",
        "focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--sd-accent)] focus-visible:text-[var(--sd-ink)]",
        "disabled:pointer-events-none disabled:opacity-35"
      )}
    >
      {children}
    </button>
  );
}
