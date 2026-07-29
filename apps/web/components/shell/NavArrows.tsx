"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useNavHistory } from "./NavHistoryProvider";
import { cn } from "@/lib/utils";

/**
 * NavArrows — Back (⌘[) / Forward (⌘]) chrome controls pinned at the left of
 * the TopTabBar, browser-style. Backed by the in-memory nav stack
 * (NavHistoryProvider); navigation is soft (router.back/forward) so realtime
 * and in-progress state are preserved.
 *
 * The Forward control is disabled (greyed, no-op) when there's no forward
 * history; Back is disabled at the first screen. Both mirror the keyboard
 * shortcuts handled in GlobalHotkeys.
 */
export function NavArrows() {
  const { canGoBack, canGoForward, goBack, goForward } = useNavHistory();

  return (
    <div className="flex items-center gap-0.5 pr-1.5 mr-0.5 border-r border-[var(--edge)]">
      <NavArrowButton
        direction="back"
        disabled={!canGoBack}
        onClick={goBack}
        label="Go back"
        kbd="⌘["
      />
      <NavArrowButton
        direction="forward"
        disabled={!canGoForward}
        onClick={goForward}
        label="Go forward"
        kbd="⌘]"
      />
    </div>
  );
}

function NavArrowButton({
  direction,
  disabled,
  onClick,
  label,
  kbd,
}: {
  direction: "back" | "forward";
  disabled: boolean;
  onClick: () => void;
  label: string;
  kbd: string;
}) {
  const Icon = direction === "back" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={`${label} (${kbd})`}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-lg",
        "transition-[background-color,color,opacity] duration-150 ease-out",
        disabled
          ? "text-[var(--ink-muted)] opacity-30 cursor-default"
          : "text-[var(--ink-muted)] hover:bg-[color-mix(in_oklch,var(--ink)_5%,transparent)] hover:text-[var(--ink)]"
      )}
    >
      <Icon size={15} strokeWidth={1.75} />
    </button>
  );
}
