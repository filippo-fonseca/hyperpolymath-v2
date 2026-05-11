"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Sun, CheckSquare, MessageSquare, Calendar } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const items = [
  { href: "/today", label: "Today", icon: Sun, disabled: false, tooltip: undefined },
  { href: "/tasks", label: "All Tasks", icon: CheckSquare, disabled: false, tooltip: undefined },
  { href: "/captures", label: "Captures", icon: MessageSquare, disabled: false, tooltip: undefined },
  {
    href: "/calendar",
    label: "Calendar",
    icon: Calendar,
    disabled: true,
    tooltip: "Coming in Phase 4",
  },
] as const;

interface Props {
  collapsed: boolean;
}

export function PersistentNav({ collapsed }: Props) {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={300}>
      <nav className="flex flex-col gap-1 px-2" aria-label="Main navigation">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);

          const inner = (
            <span
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-sans w-full",
                active && !item.disabled
                  ? "bg-secondary border-l-2 border-accent"
                  : "border-l-2 border-transparent",
                item.disabled && "opacity-40 cursor-not-allowed",
                !active && !item.disabled && "hover:bg-secondary",
              )}
              aria-label={item.label}
              aria-disabled={item.disabled}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </span>
          );

          if (item.disabled) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <div role="button" tabIndex={0} className="w-full">
                    {inner}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">{item.tooltip}</TooltipContent>
              </Tooltip>
            );
          }

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link href={item.href} className="w-full">
                    {inner}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Link key={item.href} href={item.href} className="w-full">
              {inner}
            </Link>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
