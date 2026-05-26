"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  CheckSquare,
  MessageSquare,
  Calendar,
  Settings,
  BarChart2,
  Info,
} from "lucide-react";
import { KiwiIcon } from "@/components/shared/KiwiIcon";
import { KiwiAboutDialog } from "./KiwiAboutDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGcalConnectionStatus } from "@/lib/gcal/useGcalConnectionStatus";
import { cn } from "@/lib/utils";
import { subscribeToMicState } from "@/lib/voice/mic-state-bus";
import { MicIndicatorDot } from "@/components/voice/MicIndicatorDot";
import { DiscreetToggleButton } from "@/components/voice/DiscreetToggleButton";
import { PressToTalkButton } from "@/components/voice/PressToTalkButton";
import type { MicState } from "@/lib/voice/types";

/**
 * Top-level primary navigation rendered inside the Sidebar's NAVIGATE section.
 *
 * Phase 4 Plan 04-03: /calendar now unblocks (Wave 3 shipped); Settings
 * entry added with red-dot badge wired to `useGcalConnectionStatus()`
 * (D-04 + M-04 fix). The badge appears when gcal is disconnected/revoked
 * so the user always has a one-click path back even if they aren't on
 * /calendar at the moment.
 *
 * Phase 6.1 Plan 06.1-05 (UI-SPEC §5e + §12e):
 *
 * The JARVIS entry is the home destination. Per UI-SPEC §12e the link label
 * is "JARVIS" (not "Today", not "Home") — the destination IS the agent. The
 * route still points to /today (where JarvisConsole mounts) until a future
 * plan rewires the route. Active link gets 1px --edge-hud LEFT-edge accent
 * (not a bg fill); the JARVIS link additionally gets a 4px --hud-cyan dot
 * when active — the one place cyan touches diplomatic chrome per UI-SPEC §5e.
 *
 * Mono uppercase tracking-wide nav labels per UI-SPEC §5e. Hover opacity
 * 0.7 → 1 over 100ms per UI-SPEC §7a.
 */
const items = [
  { href: "/today", label: "JARVIS", icon: KiwiIcon, disabled: false, tooltip: undefined, isAgent: true },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, disabled: false, tooltip: undefined, isAgent: false },
  { href: "/captures", label: "Captures", icon: MessageSquare, disabled: false, tooltip: undefined, isAgent: false },
  { href: "/calendar", label: "Calendar", icon: Calendar, disabled: false, tooltip: undefined, isAgent: false },
  { href: "/insights", label: "Insights", icon: BarChart2, disabled: false, tooltip: undefined, isAgent: false },
  { href: "/settings", label: "Settings", icon: Settings, disabled: false, tooltip: undefined, isAgent: false },
] as const;

/**
 * Phase 7 Plan 07-03 — subscribes to the JarvisListener module-level singleton
 * and feeds current MicState into MicIndicatorDot. Thin adapter: no logic here.
 */
function MicIndicatorDotContainer() {
  const [state, setState] = useState<MicState>("idle");
  useEffect(() => subscribeToMicState(setState), []);
  return <MicIndicatorDot state={state} />;
}

interface Props {
  collapsed: boolean;
}

export function PersistentNav({ collapsed }: Props) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  // M-04 fix — keep the badge visibility data-driven. `undefined` (still
  // loading) is treated as "no badge" so we never flash a red dot on first
  // render before the hook resolves.
  const { data: gcalStatus } = useGcalConnectionStatus();
  const showGcalBadge =
    gcalStatus !== undefined && gcalStatus !== "connected";

  return (
    <TooltipProvider delayDuration={300}>
      <nav className="flex flex-col gap-0.5 px-2" aria-label="Main navigation">
        {items.map((item) => {
          const Icon = item.icon;
          const active = !!pathname?.startsWith(item.href);
          const isSettings = item.href === "/settings";
          const renderBadge = isSettings && showGcalBadge;

          const inner = (
            <span
              className={cn(
                // Arc-style nav row: pill background on active, generous padding,
                // sentence-case sans label. Larger touch target + icon for the
                // 2026 refresh.
                "group relative flex items-center gap-3 rounded-lg px-3 h-9 w-full",
                "font-serif text-[14px] tracking-tight",
                "transition-all duration-150 ease-out",
                active && !item.disabled
                  ? "text-[var(--ink)]"
                  : "text-[var(--ink-muted)]",
                !active && !item.disabled &&
                  "hover:text-[var(--ink)] hover:bg-[color-mix(in_oklch,var(--ink)_4%,transparent)]",
                item.disabled && "opacity-40 cursor-not-allowed",
              )}
              style={
                active && !item.disabled
                  ? {
                      background:
                        "linear-gradient(95deg, color-mix(in oklch, var(--hud-cyan) 22%, transparent) 0%, color-mix(in oklch, var(--hud-cyan) 8%, transparent) 60%, transparent 100%)",
                      boxShadow:
                        "0 0 24px color-mix(in oklch, var(--hud-cyan) 14%, transparent), inset 0 0 0 1px color-mix(in oklch, var(--hud-cyan) 28%, transparent)",
                    }
                  : undefined
              }
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              aria-disabled={item.disabled}
            >
              {/* Active accent bar — vertical cyan stripe on the left, only when active */}
              {active && !item.disabled && !reduceMotion && (
                <motion.span
                  layoutId="nav-active-stripe"
                  className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full"
                  style={{ backgroundColor: "var(--hud-cyan)" }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  aria-hidden="true"
                />
              )}
              {/* Icon + collapsed-mode badge anchor. */}
              <span className="relative shrink-0">
                <Icon
                  size={18}
                  strokeWidth={active ? 2 : 1.5}
                  className={
                    item.isAgent && active
                      ? "text-[var(--hud-cyan)]"
                      : undefined
                  }
                />
                {renderBadge && collapsed && (
                  <span
                    className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--surface)]"
                    style={{ backgroundColor: "var(--ink-coral)" }}
                    aria-label="Google Calendar disconnected"
                  />
                )}
              </span>
              {!collapsed && (
                <span className={cn("flex-1", active && "font-medium")}>
                  {item.label}
                </span>
              )}
              {renderBadge && !collapsed && (
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: "var(--ink-coral)" }}
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

        {/* Phase 7 Plan 07-03 — voice status row (D-01 two-element pattern). */}
        <div className="flex items-center gap-1 px-2 py-1.5 mt-1 border-t border-[var(--edge)] pt-2">
          <div className="agent-mode-scope inline-flex items-center">
            <MicIndicatorDotContainer />
          </div>
          {!collapsed && (
            <>
              <PressToTalkButton />
              <DiscreetToggleButton />
            </>
          )}
        </div>

        {/* "Meet Kiwi" info trigger — opens the KiwiAboutDialog modal.
            Small ghost button so it sits at the bottom of the sidebar
            without competing with the primary nav. Collapsed mode shows
            just the icon with a tooltip. */}
        <KiwiAboutDialog>
          <button
            type="button"
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 h-9 w-full",
              "font-serif text-[14px] tracking-tight text-[var(--ink-muted)]",
              "transition-all duration-150 ease-out",
              "hover:text-[var(--ink)] hover:bg-[color-mix(in_oklch,var(--ink)_4%,transparent)]",
            )}
            aria-label="About Kiwi"
          >
            <span className="relative shrink-0">
              <Info size={16} strokeWidth={1.5} aria-hidden="true" />
            </span>
            {!collapsed && (
              <span className="flex-1 text-left italic">About Kiwi</span>
            )}
          </button>
        </KiwiAboutDialog>
      </nav>
    </TooltipProvider>
  );
}
