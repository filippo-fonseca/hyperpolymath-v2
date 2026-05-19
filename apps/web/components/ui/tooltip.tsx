"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Phase 6.1 Plan 06.1-05 (UI-SPEC §5f + §9c):
 *
 * Tooltips are pure chrome — they label other chrome elements (icon
 * buttons, ambiguous controls). Mono 11px uppercase tracking-wide register
 * per UI-SPEC §4a "mono = machine" surface coding. Surface tier matches
 * Popover (--surface-raised + 1px --edge). Motion: scale 0.95→1 + fade-in
 * 200ms; slide-from-side micro-animation per the existing shadcn pattern.
 *
 * Neumorphic shadow tokens retired (UI-SPEC §14a).
 */
function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-fit origin-(--radix-tooltip-content-transform-origin) overflow-hidden rounded-sm border border-[var(--edge)] bg-[var(--surface-raised)] px-2 py-1 text-balance text-[var(--ink-muted)] font-mono text-[11px] uppercase tracking-[0.06em]",
          "shadow-[0_4px_12px_rgba(0,0,0,0.2)]",
          "animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-[var(--surface-raised)] fill-[var(--surface-raised)]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
