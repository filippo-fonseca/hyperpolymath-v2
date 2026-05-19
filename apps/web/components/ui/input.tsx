import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Phase 06.1 Plan 04 (UI-SPEC §9d) — Document-tier Input.
 *
 * bg --surface + 1px --edge border + --ink-amber focus border. Phase 6's
 * retired input inset boxShadow token (purged in Plan 06.1-01) is absent.
 *
 * `focus-visible:outline-none` defers to the global :focus-visible rule in
 * globals.css which paints --ring-doc (amber 2-stop ring). The border shift
 * to --ink-amber on focus is the 1px chrome change called out in UI-SPEC §9d.
 *
 * 150ms transition-colors so the border swap feels deliberate, not snappy.
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
          "focus-visible:outline-none focus-visible:border-[var(--ink-amber)] " +
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
