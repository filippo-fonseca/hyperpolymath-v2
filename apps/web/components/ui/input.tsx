import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Phase 06.1 Plan 04 (UI-SPEC §9d) — Document-tier Input.
 *
 * bg --surface + 1px --edge border at rest. Focus border + ring are both
 * painted by the global `input:focus-visible` rule in globals.css (calm
 * neutral --edge-hud, not the amber doc ring — see comment at globals.css
 * §"Focus-visible ring system"). The earlier amber border override here
 * fought that global rule and produced an inconsistent amber-border-inside-
 * cyan-ring focus state — see issue #43.
 *
 * 150ms transition-colors keeps the resting → focus swap feeling deliberate.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-[var(--edge)] bg-[var(--surface)] px-3 py-1 text-base font-serif " +
          "text-[var(--ink)] placeholder:text-[var(--ink-muted)] " +
          "selection:bg-[var(--ink)] selection:text-[var(--canvas)] " +
          "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--ink)] " +
          "transition-colors duration-150 ease-out " +
          "focus-visible:outline-none " +
          "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none " +
          "aria-invalid:border-[var(--ink-coral)]",
        "md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
