import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Document-tier Textarea — token-matched to the Input primitive.
 *
 * bg --surface + 1px --edge border at rest; border swaps to --ink-amber on
 * focus (paired with the global :focus-visible amber ring via --ring-doc).
 * Serif body text + muted-ink placeholder so it reads as document content,
 * not chrome.
 *
 * `field-sizing-content` keeps the textarea auto-expanding as the user
 * types — same behavior as the prior shadcn default; only the visual
 * register has changed.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-md border border-[var(--edge)] bg-[var(--surface)] px-3 py-2 text-base font-serif",
        "text-[var(--ink)] placeholder:text-[var(--ink-muted)]",
        "selection:bg-[var(--ink)] selection:text-[var(--canvas)]",
        "transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:border-[var(--ink-amber)]",
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
