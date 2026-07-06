"use client"

import { Collapsible as CollapsiblePrimitive } from "radix-ui"

/**
 * Thin shadcn-style wrapper over Radix Collapsible (via the unified `radix-ui`
 * package, matching popover.tsx). Unstyled by design — consumers own the
 * trigger/content chrome so it fits each surface (the /captures "Resurfacing
 * today" section styles its own header + animated content).
 */
function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
