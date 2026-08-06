"use client";

import { PolypadIndicatorDot } from "@/components/polypad/PolypadIndicatorDot";
import {
  type GcalBadge,
  GcalStatusDot,
  useGcalBadge,
} from "@/components/shell/GcalStatusIndicator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DiscreetToggleButton } from "@/components/voice/DiscreetToggleButton";
import { MicIndicatorDot } from "@/components/voice/MicIndicatorDot";
import {
  type PolypadConnectionState,
  subscribeToPolypadState,
} from "@/lib/polypad/polypad-state-bus";
import { cn } from "@/lib/utils";
import { subscribeToMicState } from "@/lib/voice/mic-state-bus";
import type { MicState } from "@/lib/voice/types";
import { useVoiceSourceStatus } from "@/lib/voice/use-voice-source-status";
import {
  AreaIcon,
  CaptureIcon,
  type DimensionalIconProps,
  FolderIcon,
  HabitIcon,
  InsightIcon,
  JarvisIcon,
  PageIcon,
  TaskIcon,
  TrainingIcon,
  WidgetIcon,
} from "@/components/ui/icons";
import {
  Calendar,
  type LucideIcon,
  Newspaper,
  Search,
  Settings,
  Users,
  UtensilsCrossed,
  Waypoints,
} from "lucide-react";
import type { ComponentType } from "react";
import { Laptop } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * The sidebar's navigation rails.
 *
 * Row grammar is the Spacedrive source grammar adopted verbatim by
 * UI-CONTRACT §11: `rounded px-2 text-body font-medium tracking-wide`, 16px
 * icons, ink-dull at rest. The ACTIVE tint is the ONLY background a row ever
 * gets — there is deliberately no hover fill, which is what keeps a 14-row
 * column from strobing as the pointer crosses it. Hover moves text ink-dull →
 * ink and nothing else.
 *
 * Two rails ship from this file. MAIN is the unheadered top block; SYSTEM is
 * the JARVIS/Insights/Settings block that sits under AREAS (§1.3). They share
 * one active-pill layoutId so the backplate slides between them.
 */

/**
 * Two icon registers, per UI-CONTRACT §12.
 *
 * NOUNS (the things the app is made of — LifeOS, Tasks, Habits, Training,
 * Journal, Captures, Wiki, Insights, JARVIS) carry the dimensional icon family
 * at 18px. They are the register's mascots, and giving them the material icon
 * is what makes the column feel like this app rather than a generic shell.
 *
 * VERBS (Search, Calendar, Graph, People, Settings — things you *do*, or plain
 * utilities) stay 16px lucide line icons. Rendering a verb as a lit indigo
 * object would over-claim: it promises a destination that has no substance
 * behind it.
 */
interface NavItem {
  href: string;
  label: string;
  /** Verb register — 16px lucide. */
  icon?: LucideIcon;
  /** Noun register — 18px dimensional. Wins when both are set. */
  dimensional?: ComponentType<DimensionalIconProps>;
  disabled?: boolean;
  tooltip?: string;
}

/** MAIN rail — the unheadered top block (§1.3). */
const MAIN_ITEMS: readonly NavItem[] = [
  { href: "/search", label: "Search", icon: Search },
  { href: "/lifeos", label: "LifeOS", dimensional: WidgetIcon },
  // Areas rides this high because it is the taxonomy root — the spine every
  // project and task hangs off — so it belongs above the nouns it contains
  // rather than among them. The AREAS section below is the browser for it;
  // this pill is the destination, and the only thing that reaches /areas from
  // a pinned rail.
  { href: "/areas", label: "Areas", dimensional: AreaIcon },
  { href: "/tasks", label: "Tasks", dimensional: TaskIcon },
  { href: "/habits", label: "Habits", dimensional: HabitIcon },
  { href: "/training", label: "Training", dimensional: TrainingIcon },
  {
    // No dimensional nutrition icon exists and the route is not built yet, so
    // it stays a lucide glyph until it earns a mascot.
    href: "/nutrition",
    label: "Nutrition",
    icon: UtensilsCrossed,
    disabled: true,
    tooltip: "Coming soon",
  },
  { href: "/journaling", label: "Journal", dimensional: PageIcon },
  { href: "/captures", label: "Captures", dimensional: CaptureIcon },
  // No dimensional briefing icon exists yet, so it stays a lucide glyph until
  // it earns a mascot (same rule as /nutrition above).
  { href: "/briefing", label: "Briefing", icon: Newspaper },
  { href: "/people", label: "People", icon: Users },
  { href: "/wiki", label: "Wiki", dimensional: FolderIcon },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/graph", label: "Graph", icon: Waypoints },
] as const;

/** SYSTEM rail — sits below AREAS (§1.3). */
const SYSTEM_ITEMS: readonly NavItem[] = [
  { href: "/jarvis", label: "JARVIS", dimensional: JarvisIcon },
  { href: "/insights", label: "Insights", dimensional: InsightIcon },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/**
 * One nav row. `badge` renders the 6px functional dot (§1.4) and, when set,
 * gives the row a tooltip that says what is wrong and where to fix it. Calendar
 * and Settings both carry it when the Google Calendar connection is down.
 */
function NavRow({
  item,
  collapsed,
  badge = null,
}: {
  item: NavItem;
  collapsed: boolean;
  badge?: GcalBadge | null;
}) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const active = !!pathname?.startsWith(item.href);
  const disabled = !!item.disabled;

  const inner = (
    <span
      className={cn(
        "group relative flex h-8 w-full items-center rounded-lg px-2",
        "text-body font-medium tracking-wide",
        // Colour-only transition: no fill, no transform, nothing to jank.
        "transition-colors duration-[120ms] ease-out",
        active && !disabled
          ? "text-[var(--sd-ink)]"
          : disabled
            ? "cursor-not-allowed text-[var(--sd-ink-dull)] opacity-40"
            : "text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]"
      )}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      aria-disabled={disabled}
    >
      {/* Active backplate — the only bg a row ever carries. Slides between
          rows via layoutId; static under reduced motion. */}
      {active &&
        !disabled &&
        (reduceMotion ? (
          <span
            className="absolute inset-0 rounded-lg bg-[color-mix(in_oklch,var(--sd-selected)_40%,transparent)]"
            aria-hidden="true"
          />
        ) : (
          <motion.span
            layoutId="nav-active-pill"
            className="absolute inset-0 rounded-lg bg-[color-mix(in_oklch,var(--sd-selected)_40%,transparent)]"
            transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
            aria-hidden="true"
          />
        ))}

      {/* Both registers occupy the same 18px slot so every label in the column
          starts on one vertical line, regardless of which icon it carries. */}
      <span className="relative z-10 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        {item.dimensional ? (
          <item.dimensional size={18} />
        ) : item.icon ? (
          <item.icon size={16} strokeWidth={1.75} />
        ) : null}
        {badge && collapsed && <GcalStatusDot badge={badge} collapsed />}
      </span>

      {!collapsed && <span className="relative z-10 ml-2 flex-1 truncate">{item.label}</span>}

      {/* Soon chip (§1.4) — sentence-case micro-label on a raised box, never
          accent. Label register, so no mono and no caps (SDC-1 §2.4). */}
      {disabled && !collapsed && (
        <span
          className="relative z-10 flex h-[18px] shrink-0 items-center rounded-[4px] bg-[var(--sd-box)] px-1.5 text-micro font-medium text-[var(--sd-ink-faint)]"
          aria-hidden="true"
        >
          Soon
        </span>
      )}

      {/* Functional dot (§1.4) — 6px, right-aligned. */}
      {badge && !collapsed && <GcalStatusDot badge={badge} collapsed={false} />}
    </span>
  );

  const tourKey = `nav-${item.href.replace(/^\//, "")}`;

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div role="button" tabIndex={0} className="w-full" data-tour={tourKey}>
            {inner}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">{item.tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  const link = (
    <Link href={item.href} className="w-full" data-tour={tourKey}>
      {inner}
    </Link>
  );

  // A badged row explains itself in both rail states. A bare dot reports that
  // something is wrong without saying what or how to clear it, which is the one
  // way this indicator could end up worse than no indicator. The copy is a
  // sentence, so it opts out of the tooltip's mono-uppercase machine register.
  if (badge) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent
          side="right"
          className="max-w-[240px] font-sans normal-case tracking-normal"
        >
          {collapsed ? (
            <span className="flex flex-col gap-1">
              <span className="text-[var(--sd-ink)]">{item.label}</span>
              <span>{badge.tooltip}</span>
            </span>
          ) : (
            badge.tooltip
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return link;
}

interface Props {
  collapsed: boolean;
}

/**
 * MAIN rail (§1.3) — no section header; the labels speak for themselves.
 *
 * Calendar carries the Google Calendar badge, because the row that owns the
 * feature is where a dropped connection should first be legible. Settings keeps
 * its own copy of the badge (below) for the case where you are nowhere near the
 * Calendar row.
 */
export function PersistentNav({ collapsed }: Props) {
  const gcalBadge = useGcalBadge();

  return (
    <TooltipProvider delayDuration={300}>
      <nav className="flex flex-col gap-0.5" aria-label="Main navigation">
        {MAIN_ITEMS.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            collapsed={collapsed}
            badge={item.href === "/calendar" ? gcalBadge : null}
          />
        ))}
      </nav>
    </TooltipProvider>
  );
}

/**
 * SYSTEM rail (§1.3) — JARVIS, Insights, Settings. Settings carries the
 * red-dot badge when Google Calendar is disconnected, so there is always a
 * one-click path back even when the user is nowhere near /calendar.
 */
export function SidebarSystemNav({ collapsed }: Props) {
  // `undefined` (still loading) resolves to no badge inside the hook, so we
  // never flash a red dot before the status arrives.
  const gcalBadge = useGcalBadge();

  return (
    <TooltipProvider delayDuration={300}>
      <nav className="flex flex-col gap-0.5" aria-label="System navigation">
        {SYSTEM_ITEMS.map((item) => (
          <NavRow
            key={item.href}
            item={item}
            collapsed={collapsed}
            badge={item.href === "/settings" ? gcalBadge : null}
          />
        ))}
      </nav>
    </TooltipProvider>
  );
}

/**
 * Pinned Google Calendar fault row (§1.4).
 *
 * The /calendar row above carries the same badge, and that is still the right
 * home for it: the row that owns the feature is where a dropped connection
 * should first be legible. It is just not a SUFFICIENT home. MAIN lives in the
 * sidebar's scroll column and Calendar is its thirteenth row; the column is
 * `flex-1`, so at 1280x720 it shows about nine rows and the badge sits ~80px
 * below the fold. On every laptop viewport the indicator was invisible unless
 * you scrolled to it, which is the same failure the SYSTEM block was pinned to
 * escape (see the footer-stack comment in Sidebar.tsx).
 *
 * So this is the pinned copy, mounted in that same footer stack. It renders
 * ONLY while the connection is down, so a healthy sidebar pays no vertical
 * space for it, and it is a link straight to the reconnect control rather than
 * a bare state report: a fault the reader cannot act on is chrome.
 *
 * Coral 12%-alpha chip plus the canonical 6px dot — functional ink, never
 * accent, so it costs nothing against the two-accent-per-viewport budget.
 */
export function SidebarGcalAlert({ collapsed }: Props) {
  const badge = useGcalBadge();
  if (!badge) return null;

  const chrome = cn(
    "flex items-center rounded-lg transition-colors duration-[120ms] ease-out",
    "bg-[color-mix(in_oklch,var(--ink-coral)_12%,transparent)]",
    "hover:bg-[color-mix(in_oklch,var(--ink-coral)_18%,transparent)]",
    "shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--ink-coral)_22%,transparent)]",
    collapsed ? "h-7 w-7 justify-center" : "h-7 w-full gap-2 px-2"
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex", collapsed && "justify-center")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/settings#integrations"
              aria-label={`${badge.label}. Reconnect it in Settings.`}
              data-slot="gcal-sidebar-alert"
              className={chrome}
            >
              {collapsed ? (
                // 56px of rail has no room for the label, so the glyph has to
                // say which connection dropped. Same corner-dot shape the
                // collapsed nav badge uses, so the two read as one language.
                <span className="relative flex h-[18px] w-[18px] items-center justify-center text-[var(--ink-coral)]">
                  <Calendar size={16} strokeWidth={1.75} aria-hidden="true" />
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-[var(--sd-sidebar)]"
                    style={{ backgroundColor: "var(--ink-coral)" }}
                  />
                </span>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: "var(--ink-coral)" }}
                  />
                  <span className="truncate text-micro font-medium text-[var(--ink-coral)]">
                    {badge.short}
                  </span>
                </>
              )}
            </Link>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className="max-w-[240px] font-sans normal-case tracking-normal"
          >
            {badge.tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

/** Subscribes to the JarvisListener singleton; feeds MicState to the dot. */
function MicIndicatorDotContainer() {
  const [state, setState] = useState<MicState>("idle");
  useEffect(() => subscribeToMicState(setState), []);
  return <MicIndicatorDot state={state} />;
}

/** Mirrors MicIndicatorDotContainer for the Polypad device connection. */
function PolypadIndicatorDotContainer({ collapsed }: { collapsed: boolean }) {
  const [state, setState] = useState<PolypadConnectionState>("disconnected");
  useEffect(() => subscribeToPolypadState(setState), []);
  return <PolypadIndicatorDot state={state} collapsed={collapsed} />;
}

/**
 * POLYPAD / voice status row (§1.5). A 28px strip of live dots plus, when the
 * desktop app has claimed the mic, a cyan "Desktop" pill — cyan stays
 * functional-only chrome here, never decoration.
 *
 * Lives in the sidebar footer stack (above the identity block) rather than
 * inline in the nav, per the §1 top-to-bottom anatomy.
 */
export function SidebarStatusRow({ collapsed }: Props) {
  const { desktopClaimed } = useVoiceSourceStatus();

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex h-7 items-center gap-2",
          collapsed ? "justify-center" : "px-1"
        )}
      >
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
                  className="inline-flex h-5 w-5 items-center justify-center rounded-[4px]"
                  style={{
                    color: "var(--hud-cyan)",
                    background: "color-mix(in oklch, var(--hud-cyan) 6%, transparent)",
                    boxShadow:
                      "inset 0 0 0 1px color-mix(in oklch, var(--hud-cyan) 18%, transparent)",
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
              className="ml-auto inline-flex items-center gap-2 rounded-[4px] px-2 py-[3px] text-micro font-medium"
              style={{
                color: "var(--hud-cyan)",
                background: "color-mix(in oklch, var(--hud-cyan) 6%, transparent)",
                boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--hud-cyan) 18%, transparent)",
              }}
            >
              <Laptop size={11} strokeWidth={1.75} aria-hidden="true" />
              <span>Desktop</span>
            </span>
          ))}
      </div>
    </TooltipProvider>
  );
}
