"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

/**
 * Renders `text` truncated (or line-clamped), and shows the full string in an
 * sd Tooltip only when it actually overflows. Avoids the native OS `title`
 * tooltip — this is our chrome.
 *
 * Expects a parent {@link TooltipProvider} (use {@link OverflowTooltipProvider}
 * once around the explorer surface).
 */
export function OverflowTooltip({
  text,
  className,
  clampLines = 1,
  side = "top",
  sideOffset = 6,
  contentClassName,
}: {
  text: string;
  className?: string;
  /** 1 = single-line ellipsis, 2 = two-line clamp. */
  clampLines?: 1 | 2;
  side?: ComponentPropsWithoutRef<typeof TooltipContent>["side"];
  sideOffset?: number;
  contentClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 1px slack avoids subpixel false positives on some displays.
    const wide = el.scrollWidth > el.clientWidth + 1;
    const tall = el.scrollHeight > el.clientHeight + 1;
    setOverflowing(wide || tall);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, text, clampLines]);

  const label = (
    <div
      ref={ref}
      className={cn(clampLines === 2 ? "line-clamp-2" : "truncate", className)}
    >
      {text}
    </div>
  );

  if (!overflowing || !text) {
    return label;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{label}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={sideOffset}
        // Content names read as prose, not chrome — override the default mono
        // uppercase register used for UI labels.
        className={cn(
          "max-w-[min(20rem,calc(100vw-2rem))] font-sans text-[0.8rem] normal-case tracking-normal text-[var(--sd-ink)]",
          contentClassName
        )}
      >
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/** Hover delay suited to truncated folder/page labels in the explorer. */
export function OverflowTooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipProvider delayDuration={280}>{children}</TooltipProvider>;
}
