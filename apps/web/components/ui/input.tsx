import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Phase 06.1 Plan 04 (UI-SPEC §9d) — Document-tier Input.
 *
 * bg --surface + 1px --edge border at rest. Focus border + ring are both
 * painted by the global `input:focus-visible` rule in globals.css, which
 * resolves to the canonical cyan --ring-focus token (issue #140). No local
 * focus override here so the field inherits the one shared focus identity.
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
