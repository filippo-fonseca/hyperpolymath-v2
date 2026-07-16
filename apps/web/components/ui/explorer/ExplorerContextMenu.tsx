"use client";

import { cn } from "@/lib/utils";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

export function ExplorerContextMenu(props: ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="explorer-context-menu" {...props} />;
}

export function ExplorerContextMenuTrigger(props: ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
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
          "z-50 min-w-[168px] overflow-hidden rounded-[6px] border border-[var(--sd-line)] bg-[var(--sd-menu)] p-1 font-sans text-[0.8rem] text-[var(--ink)]",
          "shadow-[0_14px_34px_hsl(235_15%_0%_/_0.46)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1",
          className,
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
        "relative flex h-7 select-none items-center gap-2 rounded-[4px] px-2 text-[var(--ink)] outline-none",
        "transition-colors duration-[120ms] ease-out focus:bg-[var(--sd-menu-hover)]",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[inset]:pl-7",
        "data-[variant=destructive]:text-[var(--ink-coral)] data-[variant=destructive]:focus:bg-[color-mix(in_oklch,var(--ink-coral)_16%,transparent)]",
        "[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-[var(--ink-muted)]",
        className,
      )}
      {...props}
    />
  );
}

export function ExplorerContextMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return <ContextMenuPrimitive.Separator className={cn("-mx-1 my-1 h-px bg-[var(--sd-line)]", className)} {...props} />;
}

export function ExplorerContextMenuShortcut({
  className,
  ...props
}: ComponentProps<"span">) {
  return (
    <span
      className={cn("ml-auto pl-6 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-[var(--ink-muted)]", className)}
      {...props}
    />
  );
}
