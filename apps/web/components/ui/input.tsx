import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * sd register (sesh-sd3, unit-primitives) — Input.
 *
 * Recessed `--sd-input` fill + 1px `--sd-line` hairline at rest. Focus
 * border + ring are painted by the global `input:focus-visible` rule in
 * globals.css — the shared cyan focus identity (#140) that every control
 * carries, so no local focus override here.
 *
 * 120ms color-only transition keeps the resting → focus swap deliberate.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-[var(--sd-line)] bg-[var(--sd-input)] px-3 py-1 text-base " +
          "text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-faint)] " +
          "selection:bg-[var(--sd-ink)] selection:text-[var(--sd-app)] " +
          "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--sd-ink)] " +
          "transition-colors duration-[120ms] ease-out " +
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
