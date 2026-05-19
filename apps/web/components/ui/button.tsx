import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Phase 06.1 Plan 04 (UI-SPEC §9a) — Document-tier Button.
 *
 * Every variant has explicit hover + active + disabled states; 150ms
 * transition-colors duration; cursor-pointer-always universal rule from
 * Phase 6 06-01; `focus-visible:outline-none` defers to the global
 * :focus-visible rule in globals.css which paints --ring-doc.
 *
 * NO neumorphic shadow on any button — Phase 6's retired button shadow tokens
 * (purged in Plan 06.1-01) are intentionally absent. Consumers that need an
 * agent-tier glow add it inline at the consumption site.
 *
 * Destructive intentionally uses --ring-doc (amber) on focus, not red — keeps
 * the button bordered + colored in coral but the ring stays in the document
 * register per UI-SPEC §9a.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-serif whitespace-nowrap cursor-pointer-always " +
    "transition-colors duration-150 ease-out " +
    "focus-visible:outline-none " +
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none " +
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Document primary — solid ink fill
        default:
          "bg-[var(--ink)] text-[var(--canvas)] hover:opacity-90 active:opacity-80",
        // Destructive — bordered coral, amber ring on focus (UI-SPEC §9a)
        destructive:
          "bg-transparent border border-[var(--ink-coral)] text-[var(--ink-coral)] " +
          "hover:bg-[color:rgb(220_38_38_/_0.08)] active:bg-[color:rgb(220_38_38_/_0.16)]",
        // Outline / Secondary — 1px edge, surface on hover
        outline:
          "bg-transparent border border-[var(--edge)] text-[var(--ink)] " +
          "hover:bg-[var(--surface)] active:bg-[var(--surface-raised)]",
        secondary:
          "bg-transparent border border-[var(--edge)] text-[var(--ink)] " +
          "hover:bg-[var(--surface)] active:bg-[var(--surface-raised)]",
        // Ghost — no border at rest; surface on hover
        ghost:
          "bg-transparent text-[var(--ink)] hover:bg-[var(--surface)] active:bg-[var(--surface-raised)]",
        // Link — underlined affordance
        link:
          "bg-transparent text-[var(--ink)] underline-offset-4 hover:underline active:opacity-80",
      },
      size: {
        default: "h-9 px-4 py-2 text-base has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 text-sm has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 text-base has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
