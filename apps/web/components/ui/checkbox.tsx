"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Document-tier Checkbox — token-matched to Input.
 *
 *   - Unchecked: bg --surface, 1px --edge border.
 *   - Checked:   bg --ink, check glyph in --canvas. Mimics a stamped mark on
 *                journal paper rather than a colored toggle button.
 *   - Focus visible: cyan ring via the global :focus-visible rule (#140).
 *   - Aria-invalid: coral border.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-[var(--edge)] bg-[var(--surface)]",
        "transition-colors duration-150 ease-out outline-none",
        "focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        "aria-invalid:border-[var(--ink-coral)]",
        "data-[state=checked]:border-[var(--ink)] data-[state=checked]:bg-[var(--ink)] data-[state=checked]:text-[var(--canvas)]",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
