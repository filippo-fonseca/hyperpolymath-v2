"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  CheckSquare,
  MessageSquare,
  Calendar,
  Settings,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGcalConnectionStatus } from "@/lib/gcal/useGcalConnectionStatus";
import { cn } from "@/lib/utils";

/**
 * Top-level primary navigation rendered in the sidebar.
 *
 * Phase 4 Plan 04-03: /calendar now unblocks (Wave 3 shipped); Settings
 * entry added with red-dot badge wired to `useGcalConnectionStatus()`
 * (D-04 + M-04 fix). The badge appears when gcal is disconnected/revoked
 * so the user always has a one-click path back even if they aren't on
 * /calendar at the moment.
 */
const items = [
  { href: "/today", label: "JARVIS", icon: Sparkles, disabled: false, tooltip: undefined },
  { href: "/tasks", label: "All Tasks", icon: CheckSquare, disabled: false, tooltip: undefined },
  { href: "/captures", label: "Captures", icon: MessageSquare, disabled: false, tooltip: undefined },
  { href: "/calendar", label: "Calendar", icon: Calendar, disabled: false, tooltip: undefined },
  { href: "/settings", label: "Settings", icon: Settings, disabled: false, tooltip: undefined },
] as const;

interface Props {
  collapsed: boolean;
}

export function PersistentNav({ collapsed }: Props) {
  const pathname = usePathname();
  // M-04 fix — keep the badge visibility data-driven. `undefined` (still
  // loading) is treated as "no badge" so we never flash a red dot on first
  // render before the hook resolves.
  const { data: gcalStatus } = useGcalConnectionStatus();
  const showGcalBadge =
    gcalStatus !== undefined && gcalStatus !== "connected";

  return (
    <TooltipProvider delayDuration={300}>
      <nav className="flex flex-col gap-1 px-2" aria-label="Main navigation">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);
          const isSettings = item.href === "/settings";
          const renderBadge = isSettings && showGcalBadge;

          const inner = (
            <span
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1 text-[13px] font-sans w-full relative",
                active && !item.disabled
                  ? "bg-secondary border-l-2 border-accent"
                  : "border-l-2 border-transparent",
                item.disabled && "opacity-40 cursor-not-allowed",
                !active && !item.disabled && "hover:bg-secondary",
              )}
              aria-label={item.label}
              aria-disabled={item.disabled}
            >
              {/* Icon + collapsed-mode badge anchor. When the sidebar is
                  narrow, anchor the dot to the icon's top-right; when wide,
                  it trails the label (rendered below). */}
              <span className="relative shrink-0">
                <Icon size={16} />
                {renderBadge && collapsed && (
                  <span
                    className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background"
                    aria-label="Google Calendar disconnected"
                  />
                )}
              </span>
              {!collapsed && <span>{item.label}</span>}
              {renderBadge && !collapsed && (
                <span
                  className="ml-auto h-2 w-2 rounded-full bg-red-500"
                  aria-label="Google Calendar disconnected"
                />
              )}
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
