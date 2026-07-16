import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * sd register (sesh-sd3, unit-primitives) — Textarea.
 *
 * Recessed `--sd-input` fill + 1px `--sd-line` hairline at rest, matching the
 * Input primitive. Focus border + ring come from the global
 * `textarea:focus-visible` rule (the shared cyan #140 identity). Sans body
 * text + faint-ink placeholder.
 *
 * `field-sizing-content` keeps the textarea auto-expanding as the user types.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-[var(--sd-line)] bg-[var(--sd-input)] px-3 py-2 text-base",
        "text-[var(--sd-ink)] placeholder:text-[var(--sd-ink-faint)]",
        "selection:bg-[var(--sd-ink)] selection:text-[var(--sd-app)]",
        "transition-colors duration-[120ms] ease-out",
        "focus-visible:outline-none",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
        "aria-invalid:border-[var(--ink-coral)]",
        "md:text-sm",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
