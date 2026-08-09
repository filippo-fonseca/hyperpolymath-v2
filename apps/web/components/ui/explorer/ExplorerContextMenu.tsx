"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

export function ExplorerContextMenu(props: ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="explorer-context-menu" {...props} />;
}

export function ExplorerContextMenuTrigger(
  props: ComponentProps<typeof ContextMenuPrimitive.Trigger>
) {
  return <ContextMenuPrimitive.Trigger data-slot="explorer-context-menu-trigger" {...props} />;
}

export function ExplorerContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="explorer-context-menu-content"
        className={cn(
          // aug-04 craft-ui-v2: frosted menu surface (craft-glass-pop owns
          // fill, edge, radius, and the pop shadow in both themes).
          "craft-glass-pop z-50 min-w-[168px] overflow-hidden p-1 font-sans text-meta text-[var(--ink)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1",
          className
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export function ExplorerContextMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="explorer-context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "relative flex h-7 select-none items-center gap-2 rounded px-2 text-[var(--ink)] outline-none",
        "transition-colors duration-[160ms] ease-out focus:bg-[var(--sd-menu-hover)]",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[inset]:pl-7",
        "data-[variant=destructive]:text-[var(--ink-coral)] data-[variant=destructive]:focus:bg-[color-mix(in_oklch,var(--ink-coral)_16%,transparent)]",
        "[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-[var(--ink-muted)]",
        className
      )}
      {...props}
    />
  );
}

export function ExplorerContextMenuSub(props: ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="explorer-context-menu-sub" {...props} />;
}

export function ExplorerContextMenuSubTrigger({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="explorer-context-menu-sub-trigger"
      className={cn(
        "relative flex h-7 select-none items-center gap-2 rounded px-2 text-[var(--ink)] outline-none",
        "transition-colors duration-[160ms] ease-out focus:bg-[var(--sd-menu-hover)]",
        "data-[state=open]:bg-[var(--sd-menu-hover)]",
        "[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-[var(--ink-muted)]",
        className
      )}
      {...props}
    />
  );
}

export function ExplorerContextMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        data-slot="explorer-context-menu-sub-content"
        className={cn(
          "craft-glass-pop z-50 max-h-[320px] min-w-[184px] overflow-y-auto p-1 font-sans text-meta text-[var(--ink)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export function ExplorerContextMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="explorer-context-menu-checkbox-item"
      className={cn(
        "relative flex min-h-7 select-none items-center gap-2 rounded py-1 pl-7 pr-2 text-[var(--ink)] outline-none",
        "transition-colors duration-[160ms] ease-out focus:bg-[var(--sd-menu-hover)]",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        className
      )}
      {...props}
    >
      <span className="absolute left-2 grid size-3.5 place-items-center">
        <ContextMenuPrimitive.ItemIndicator>
          <Check size={13} strokeWidth={2.4} className="text-[var(--sd-accent)]" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}

export function ExplorerContextMenuLabel({ className, ...props }: ComponentProps<"p">) {
  return (
    <p className={cn("px-2 py-1 text-micro text-[var(--ink-faint)]", className)} {...props} />
  );
}

export function ExplorerContextMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-[var(--sd-line)]", className)}
      {...props}
    />
  );
}

export function ExplorerContextMenuShortcut({ className, ...props }: ComponentProps<"span">) {
  // A `kbd`, not a `span`: keyboard hints are the one sanctioned uppercase-and-
  // mono slot in the type contract, and the element is what marks it as such.
  return (
    <kbd
      className={cn(
 "ml-auto pl-6 text-micro text-[var(--ink-muted)]",
        className
      )}
      {...props}
    />
  );
}
