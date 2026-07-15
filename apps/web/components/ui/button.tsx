import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * sd register (sesh-sd3, unit-primitives) — Button.
 *
 * Full structural commitment, zero theatrics: flat fills, hairlines, one
 * accent. 120ms color-only transitions; cursor-pointer-always; and
 * `focus-visible:outline-none` defers to the global :focus-visible rule in
 * globals.css, which paints the shared cyan focus identity (#140) on every
 * control alike.
 *
 * default  = accent (cyan) solid fill, dark on-accent ink (.sd-btn-solid).
 * outline / secondary = recessed --sd-input surface + --sd-line hairline,
 *   ink-dull text, no blur, no glow (.sd-btn-outline).
 * ghost    = transparent, hover tints to --sd-hover.
 * destructive = functional coral, bordered.
 * The .sd-btn-* classes live in globals.css so on-accent ink resolves in
 * both themes without a Tailwind scan-gap miss.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md whitespace-nowrap cursor-pointer-always " +
    "transition-colors duration-[120ms] ease-out " +
    "focus-visible:outline-none " +
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none " +
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Primary — flat accent fill, dark on-accent ink
        default: "sd-btn-solid",
        // Destructive — bordered functional coral, shared cyan focus ring (#140)
        destructive:
          "bg-transparent border border-[var(--ink-coral)] text-[var(--ink-coral)] " +
          "hover:bg-[color-mix(in_oklch,var(--ink-coral)_10%,transparent)] " +
          "active:bg-[color-mix(in_oklch,var(--ink-coral)_18%,transparent)]",
        // Outline / Secondary — recessed sd field surface + hairline, no blur
        outline: "sd-btn-outline",
        secondary: "sd-btn-outline",
        // Ghost — transparent at rest; surface tint on hover
        ghost:
          "bg-transparent text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)] active:bg-[var(--sd-selected)]",
        // Link — underlined affordance
        link:
          "bg-transparent text-[var(--sd-ink)] underline-offset-4 hover:underline active:opacity-80",
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
