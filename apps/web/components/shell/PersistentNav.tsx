"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  Sparkles,
  CheckSquare,
  MessageSquare,
  Calendar,
  Settings,
  BarChart2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGcalConnectionStatus } from "@/lib/gcal/useGcalConnectionStatus";
import { cn } from "@/lib/utils";
import {
  subscribeToMicState,
} from "@/components/voice/JarvisListener";
import { MicIndicatorDot } from "@/components/voice/MicIndicatorDot";
import { DiscreetToggleButton } from "@/components/voice/DiscreetToggleButton";
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
  { href: "/today", label: "JARVIS", icon: Sparkles, disabled: false, tooltip: undefined, isAgent: true },
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
                // Mono uppercase chrome (UI-SPEC §5e nav-link register)
                "relative flex items-center gap-2 rounded-sm px-2 py-1 font-mono text-[11px] uppercase tracking-[0.06em] w-full",
                // 1px --edge-hud LEFT-edge accent on active route (no bg fill);
                // 100ms transition on text color + opacity per UI-SPEC §7a.
                "border-l-2 transition-colors duration-100 ease-out",
                active && !item.disabled
                  ? "border-l-[var(--edge-hud)] text-[var(--ink)]"
                  : "border-l-transparent text-[var(--ink-muted)]",
                !active && !item.disabled && "hover:text-[var(--ink)]",
                item.disabled && "opacity-40 cursor-not-allowed",
              )}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              aria-disabled={item.disabled}
            >
              {/* Icon + collapsed-mode badge anchor. */}
              <span className="relative shrink-0">
                <Icon size={16} strokeWidth={1.5} />
                {renderBadge && collapsed && (
                  <span
                    className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--surface)]"
                    style={{ backgroundColor: "var(--ink-coral)" }}
                    aria-label="Google Calendar disconnected"
                  />
                )}
              </span>
              {!collapsed && <span>{item.label}</span>}
              {/* JARVIS link active → 4px cyan dot (UI-SPEC §5e — the one
                  place cyan touches diplomatic chrome). Scale 0 → 1 over
                  200ms on route change unless reduced-motion. */}
              {item.isAgent && active && !collapsed && (
                <motion.span
                  initial={reduceMotion ? { scale: 1 } : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.2,
                    ease: [0.25, 1, 0.5, 1],
                  }}
                  className="ml-1 inline-block h-1 w-1 rounded-full"
                  style={{ backgroundColor: "var(--hud-cyan)" }}
                  aria-hidden="true"
                />
              )}
              {renderBadge && !collapsed && (
                <span
                  className="ml-auto h-2 w-2 rounded-full"
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

        {/* Phase 7 Plan 07-03 — voice status row (D-01 two-element pattern).
            MicIndicatorDot lives inside .agent-mode-scope (cyan HUD vocabulary).
            DiscreetToggleButton lives outside that scope (diplomatic chrome).
            Only renders content when voice is enabled (DiscreetToggleButton
            gates itself; MicIndicatorDotContainer always renders the dot but
            shows as --ink-muted at 40% in idle state when voice is off). */}
        <div className="flex items-center gap-1 px-2 py-1.5 mt-1 border-t border-[var(--edge)] pt-2">
          {/* Cyan dot inside agent-mode-scope per D-01 */}
          <div className="agent-mode-scope inline-flex items-center">
            <MicIndicatorDotContainer />
          </div>
          {/* Discreet toggle outside agent-mode-scope per D-01 */}
          {!collapsed && <DiscreetToggleButton />}
        </div>
      </nav>
    </TooltipProvider>
  );
}
