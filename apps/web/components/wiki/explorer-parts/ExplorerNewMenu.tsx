"use client";

import { cn } from "@/lib/utils";
import { ChevronDown, FilePlus2, FolderPlus, Plus } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type { ReactNode } from "react";

export function ExplorerNewMenu({
  onNewFolder,
  onNewPage,
}: {
  onNewFolder: () => void;
  onNewPage: () => void;
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 items-center overflow-hidden rounded-lg bg-[var(--sd-accent)] font-sans text-meta font-medium text-white outline-none",
            "transition-colors duration-[160ms] hover:bg-[var(--sd-accent-faint)]"
          )}
        >
          <span className="flex h-full items-center gap-2 px-3">
            <Plus size={15} strokeWidth={2.2} />
            New
          </span>
          <span className="grid h-full w-7 place-items-center border-l border-white/20">
            <ChevronDown size={13} strokeWidth={2} />
          </span>
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={6}
          className="craft-glass-pop z-50 min-w-[184px] p-1 font-sans text-meta text-[var(--sd-ink)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1"
        >
          <NewMenuItem onSelect={onNewFolder}>
            <FolderPlus />
            New folder
          </NewMenuItem>
          <NewMenuItem onSelect={onNewPage}>
            <FilePlus2 />
            New page
          </NewMenuItem>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

function NewMenuItem({ children, onSelect }: { children: ReactNode; onSelect: () => void }) {
  return (
    <DropdownMenuPrimitive.Item
      onSelect={onSelect}
      className="flex h-8 select-none items-center gap-2 rounded px-2 outline-none transition-colors duration-[160ms] focus:bg-[var(--sd-menu-hover)] [&_svg]:size-4 [&_svg]:text-[var(--sd-ink-dull)]"
    >
      {children}
    </DropdownMenuPrimitive.Item>
  );
}
