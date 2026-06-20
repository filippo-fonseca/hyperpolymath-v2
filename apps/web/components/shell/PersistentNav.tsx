"use client";

import { PolypadIndicatorDot } from "@/components/polypad/PolypadIndicatorDot";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DiscreetToggleButton } from "@/components/voice/DiscreetToggleButton";
import { MicIndicatorDot } from "@/components/voice/MicIndicatorDot";
import { useGcalConnectionStatus } from "@/lib/gcal/useGcalConnectionStatus";
import {
  type PolypadConnectionState,
  subscribeToPolypadState,
} from "@/lib/polypad/polypad-state-bus";
import { cn } from "@/lib/utils";
import { subscribeToMicState } from "@/lib/voice/mic-state-bus";
import type { MicState } from "@/lib/voice/types";
import { useVoiceSourceStatus } from "@/lib/voice/use-voice-source-status";
import {
  BarChart2,
  Calendar,
  CheckSquare,
  Dumbbell,
  FileText,
  Info,
  LayoutDashboard,
  MessageSquare,
  Repeat,
  Settings,
  UtensilsCrossed,
  Waypoints,
} from "lucide-react";
import { Laptop } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { KiwiAboutDialog } from "./KiwiAboutDialog";

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
// JARVIS is intentionally NOT here — it lives in the TopTabBar (the cyan agent
// pill), so duplicating it in the sidebar rail was redundant.
const items = [
  { href: "/lifeos", label: "LifeOS", icon: LayoutDashboard, disabled: false, tooltip: undefined },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, disabled: false, tooltip: undefined },
  { href: "/habits", label: "Habits", icon: Repeat, disabled: false, tooltip: undefined },
  { href: "/training", label: "Training", icon: Dumbbell, disabled: false, tooltip: undefined },
  {
    href: "/nutrition",
    label: "Nutrition",
    icon: UtensilsCrossed,
    disabled: true,
    tooltip: "Coming soon",
  },
  {
    href: "/captures",
    label: "Captures",
    icon: MessageSquare,
    disabled: false,
    tooltip: undefined,
  },
  {
    href: "/pages",
    label: "Pages",
    icon: FileText,
    disabled: false,
    tooltip: undefined,
  },
  { href: "/calendar", label: "Calendar", icon: Calendar, disabled: false, tooltip: undefined },
  { href: "/graph", label: "Graph", icon: Waypoints, disabled: false, tooltip: undefined },
  // /areas is NOT here — the sidebar AREAS section header below acts as
  // the link + active state, with the area tree nested under it as proper
  // children. Putting it in both spots was duplicate plumbing.
  { href: "/insights", label: "Insights", icon: BarChart2, disabled: false, tooltip: undefined },
  { href: "/settings", label: "Settings", icon: Settings, disabled: false, tooltip: undefined },
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

/**
 * Quick task 260607-gy1 — Polypad device connection indicator.
 *
 * Mirrors MicIndicatorDotContainer; accepts `collapsed` so the dot can hide
 * its label + icon in collapsed sidebar mode. Subscribes to the stub state
 * bus until the bridge ships.
 */
function PolypadIndicatorDotContainer({ collapsed }: { collapsed: boolean }) {
  const [state, setState] = useState<PolypadConnectionState>("disconnected");
  useEffect(() => subscribeToPolypadState(setState), []);
  return <PolypadIndicatorDot state={state} collapsed={collapsed} />;
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
  const showGcalBadge = gcalStatus !== undefined && gcalStatus !== "connected";
  const { desktopClaimed } = useVoiceSourceStatus();

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
                // Glassy pill nav row — matches the AREAS/projects tree register.
                // Idle = bare; hover = soft pill; active = raised pill (below).
                "group relative flex items-center gap-3 rounded-[0.7rem] px-3 h-9 w-full",
                "font-serif text-[14px] tracking-tight",
                "transition-colors duration-150 ease-out",
                !item.disabled && "sidebar-row",
                active && !item.disabled
                  ? "text-[var(--hud-cyan)]"
                  : !item.disabled
                    ? "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                    : "text-[var(--ink-muted)]",
                item.disabled && "opacity-40 cursor-not-allowed"
              )}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              aria-disabled={item.disabled}
            >
              {/* Active pill — raised glass with a whisper of cyan. Slides
                  between items via layoutId (static under reduced motion). */}
              {active &&
                !item.disabled &&
                (reduceMotion ? (
                  <span
                    className="sidebar-row-active sidebar-row-active-area absolute inset-0 rounded-[0.7rem]"
                    aria-hidden="true"
                  />
                ) : (
                  <motion.span
                    layoutId="nav-active-pill"
                    className="sidebar-row-active sidebar-row-active-area absolute inset-0 rounded-[0.7rem]"
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    aria-hidden="true"
                  />
                ))}
              {/* Icon + collapsed-mode badge anchor. */}
              <span className="relative z-10 shrink-0">
                <Icon size={18} strokeWidth={active ? 2 : 1.5} />
                {renderBadge && collapsed && (
                  <span
                    className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-[var(--surface)]"
                    style={{ backgroundColor: "var(--ink-coral)" }}
                    aria-label="Google Calendar disconnected"
                  />
                )}
              </span>
              {!collapsed && (
                <span className={cn("relative z-10 flex-1", active && "font-medium")}>
                  {item.label}
                </span>
              )}
              {item.disabled && !collapsed && (
                <span
                  className="relative z-10 shrink-0 rounded-full px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.1em] text-[var(--ink-muted)]"
                  style={{
                    background: "color-mix(in oklch, var(--ink) 6%, transparent)",
                    boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--ink) 10%, transparent)",
                  }}
                  aria-hidden="true"
                >
                  Soon
                </span>
              )}
              {renderBadge && !collapsed && (
                <span
                  className="relative z-10 h-2 w-2 rounded-full shrink-0"
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
            Now also hosts the "Voice via desktop" pill (moved here from the
            JarvisConsole overlay so it stops covering conversation elements). */}
        <div className="flex items-center gap-2 px-2 py-1.5 mt-1 border-t border-[var(--edge)] pt-2">
          <div className="agent-mode-scope inline-flex items-center">
            <MicIndicatorDotContainer />
          </div>
          <div className="agent-mode-scope inline-flex items-center">
            <PolypadIndicatorDotContainer collapsed={collapsed} />
          </div>
          {!collapsed && <DiscreetToggleButton />}
          {desktopClaimed &&
            (collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    role="status"
                    aria-live="polite"
                    aria-label="Voice input via desktop app"
                    className="ml-auto inline-flex items-center justify-center w-5 h-5 rounded-md"
                    style={{
                      color: "var(--hud-cyan)",
                      background: "color-mix(in oklch, var(--hud-cyan) 6%, transparent)",
                      boxShadow:
                        "inset 0 1px 0 color-mix(in oklch, var(--ink) 0%, transparent), inset 0 0 0 1px color-mix(in oklch, var(--hud-cyan) 18%, transparent), 0 1px 2px color-mix(in oklch, var(--ink) 12%, transparent)",
                    }}
                  >
                    <Laptop size={11} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right">Voice via desktop</TooltipContent>
              </Tooltip>
            ) : (
              <span
                role="status"
                aria-live="polite"
                aria-label="Voice input via desktop app"
                className="ml-auto inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md font-mono text-[10px] uppercase tracking-[0.1em]"
                style={{
                  color: "var(--hud-cyan)",
                  background: "color-mix(in oklch, var(--hud-cyan) 6%, transparent)",
                  boxShadow:
                    "inset 0 0 0 1px color-mix(in oklch, var(--hud-cyan) 18%, transparent), 0 1px 2px color-mix(in oklch, var(--ink) 10%, transparent)",
                }}
              >
                <Laptop size={11} strokeWidth={1.75} aria-hidden="true" />
                <span>Desktop</span>
              </span>
            ))}
        </div>

        {/* "Meet Kiwi" info trigger — opens the KiwiAboutDialog modal.
            Small ghost button so it sits at the bottom of the sidebar
            without competing with the primary nav. Collapsed mode shows
            just the icon with a tooltip. */}
        <KiwiAboutDialog>
          <button
            type="button"
            className={cn(
              "sidebar-row group relative flex items-center gap-3 px-3 h-9 w-full",
              "font-serif text-[14px] tracking-tight text-[var(--ink-muted)]",
              "transition-colors duration-150 ease-out",
              "hover:text-[var(--ink)]"
            )}
            aria-label="About Kiwi"
          >
            <span className="relative shrink-0">
              <Info size={16} strokeWidth={1.5} aria-hidden="true" />
            </span>
            {!collapsed && <span className="flex-1 text-left italic">About Kiwi</span>}
          </button>
        </KiwiAboutDialog>
      </nav>
    </TooltipProvider>
  );
}
