import { cn } from "@/lib/utils";
import { createElement, type ElementType, type ReactNode } from "react";

const TONE_SURFACE = {
  app: "var(--deck-app)",
  panel: "var(--deck-panel)",
  deep: "var(--deck-panel-deep)",
  deeper: "var(--deck-panel-deeper)",
} as const;

export type DeckPanelTone = keyof typeof TONE_SURFACE;

export interface DeckPanelProps {
  /** Element to render as. Defaults to "div". */
  as?: ElementType;
  /** Which deck surface token backs the panel. */
  tone?: DeckPanelTone;
  /** Render a 1px `--deck-line` hairline border. Defaults to true. */
  bordered?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * Flat tonal layered panel — the base surface primitive for the control deck.
 * Deliberately no hover glow and no backdrop blur; heavy glass is reserved for
 * overlays elsewhere. Just a tonal surface, an optional hairline, rounded corners.
 */
export function DeckPanel({
  as,
  tone = "panel",
  bordered = true,
  className,
  children,
  ...rest
}: DeckPanelProps & Record<string, unknown>) {
  const Component: ElementType = as ?? "div";
  // createElement (not JSX) so the polymorphic `as` doesn't collapse `children`
  // to `never`: bare ElementType unions void tags (input/br) whose children type
  // is never, which JSX intersects — createElement types children as ReactNode.
  return createElement(
    Component,
    {
      className: cn(
        "rounded-[0.5rem]",
        bordered && "border border-[var(--deck-line)]",
        className
      ),
      style: { backgroundColor: TONE_SURFACE[tone] },
      ...rest,
    },
    children
  );
}
