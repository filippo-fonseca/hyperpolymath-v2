"use client";

import { getAreasForCurrentUser } from "@/app/actions/areas";
import { AreaCreateDialog } from "@/components/areas/AreaCreateDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logotype } from "@/components/ui/Logotype";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { type OptimisticAction, optimisticReducer } from "@/lib/realtime/optimistic-reducer";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import { setSfxMuted, useSfxMuted } from "@/lib/ui/sound-prefs";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Github,
  Globe,
  Info,
  MoreHorizontal,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Scale,
  Settings,
  Sun,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useOptimistic, useState } from "react";
import { KiwiAboutDialog } from "./KiwiAboutDialog";
import { PersistentNav, SidebarStatusRow, SidebarSystemNav } from "./PersistentNav";
import { SidebarTree } from "./SidebarTree";

interface Props {
  userId: string;
  initialActiveAreas: SidebarArea[];
  initialAllAreas: SidebarArea[];
  graduationYear?: number | null;
  profile: {
    displayName: string | null;
    email: string;
    avatarUrl: string | null;
    oauthAvatarUrl: string | null;
  };
}

export type AreaOptimisticDispatch = (action: OptimisticAction<SidebarArea>) => void;

/**
 * Sidebar surface (UI-CONTRACT §1). The darkest member of the sd family, at
 * full opacity: the 65% vibrancy wash is deliberately gone. Vibrancy is a
 * desktop-app affordance; on the web it just muddies the column against
 * whatever scrolls underneath it, and a solid column reads cleaner.
 */
export const SIDEBAR_SURFACE = "bg-[var(--sd-sidebar)]";

/**
 * Row grammar, adopted verbatim from the Spacedrive source (§11).
 *
 * The load-bearing detail: rows have NO hover fill. The active tint is the
 * only background a row ever gets, which is what stops a 15-row column from
 * strobing as the pointer crosses it. Hover moves text ink-dull → ink and
 * nothing else.
 */
export const SB_ROW =
  "rounded-[6px] px-2 text-sm font-medium tracking-wide text-[var(--sd-ink-dull)] transition-colors duration-[120ms] ease-out hover:text-[var(--sd-ink)]";
/** Active row — the neutral selected backplate + ink text. No accent tint. */
export const SB_ROW_ACTIVE = "bg-[color-mix(in_oklch,var(--sd-selected)_40%,transparent)] text-[var(--sd-ink)]";
/** Quiet icon-button / emoji-chip backplate. Buttons DO take a hover fill —
 *  they're discrete targets, not a scanning column. */
export const SB_GHOST =
  "rounded-[6px] transition-colors duration-[120ms] ease-out hover:bg-[var(--sd-hover)]";
/** Keyboard focus convention (D6). */
export const SB_FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--hud-cyan)]";

/**
 * Sidebar — M3 owner of the areas useOptimistic state.
 *
 * AreaCreateDialog and SidebarTree are SIBLINGS of this component. Both consume
 * (and SidebarTree, via context menu, also mutates) the same `areas` list, so
 * `useQuery` + `useOptimistic` are lifted here and `addOptimisticArea` passed
 * down to both — no React context needed for the direct-child fan-out.
 *
 * Realtime subscriptions for both `areas` and `projects` live here too —
 * SidebarTree mutates projects (drag reorder, context-menu rename/archive),
 * so subscribing at the shared parent guarantees one channel per (table, userId)
 * regardless of how many sub-rows mount.
 *
 * Anatomy, top to bottom, per UI-CONTRACT §1: workspace pill → MAIN nav →
 * AREAS (tree) → SYSTEM → status row → identity → utility strip. Mechanism
 * (optimistic state, Realtime, collapse) is untouched by the restyle.
 */
export function Sidebar({
  userId,
  initialActiveAreas,
  initialAllAreas,
  graduationYear,
  profile,
}: Props) {
  // Hydration safety (Pitfall 16): read localStorage inside useEffect, NOT
  // during render.
  const [collapsed, setCollapsed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const storedCollapsed = localStorage.getItem("sidebar-collapsed");
    const storedShowArchived = localStorage.getItem("sidebar-show-archived");
    if (storedCollapsed === "true") setCollapsed(true);
    if (storedShowArchived === "true") setShowArchived(true);
    setMounted(true);
  }, []);

  // When collapsed, hovering temporarily expands the panel as an overlay so the
  // user can pick a destination without losing collapsed-mode page width.
  // `effectiveCollapsed` is what every inner UI bit reads — the outer aside
  // keeps its width tied to `collapsed` so the page layout never shifts.
  const effectiveCollapsed = collapsed && !hovered;

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    if (!next) setHovered(false);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  function toggleShowArchived() {
    const next = !showArchived;
    setShowArchived(next);
    localStorage.setItem("sidebar-show-archived", String(next));
  }

  // Singleton channels for both tables — the sidebar is the canonical mount
  // point. SidebarTree children also mount these (refcounted), keeping the
  // count at 1 per (table, userId) regardless of UI re-renders.
  useTableSubscription("areas", userId);
  useTableSubscription("projects", userId);

  // Active-areas list is the canonical optimistic source (the hot path —
  // create, rename, reorder all happen here). When `showArchived` is toggled we
  // display from `initialAllAreas` (not optimized; rare path).
  const { data: activeAreas = initialActiveAreas } = useQuery({
    queryKey: tableKey("areas", userId),
    queryFn: getAreasForCurrentUser,
    initialData: initialActiveAreas,
    // Treat the SSR-provided initialData as fresh at mount. Without this,
    // TanStack 5 treats initialData as updatedAt=0 (instantly stale) and any
    // invalidateQueries on this key triggers an immediate background refetch
    // even though nothing changed. Realtime remains the legitimate update path.
    initialDataUpdatedAt: Date.now(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const [optimisticAreas, addOptimisticArea] = useOptimistic(
    activeAreas,
    optimisticReducer<SidebarArea>
  );

  const areas = showArchived ? initialAllAreas : optimisticAreas;

  return (
    <aside
      aria-label="Sidebar"
      className={cn(
        "relative h-full shrink-0",
        "transition-[width] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]",
        collapsed ? "w-14" : "w-[230px]",
        // Nothing paints until localStorage has been read, so a pinned-collapsed
        // sidebar never flashes open on first frame.
        !mounted && "invisible"
      )}
    >
      <div
        onMouseEnter={() => {
          if (collapsed) setHovered(true);
        }}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "group/sidebar absolute inset-y-0 left-0 flex flex-col gap-2.5 overflow-hidden p-2.5 pb-2",
          "border-r border-[var(--sd-line)]",
          SIDEBAR_SURFACE,
          "transition-[width] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]",
          effectiveCollapsed ? "w-14" : "w-[230px]",
          // Collapsed hover-expand floats above the page as a temporary overlay.
          collapsed &&
            hovered &&
            "z-50 rounded-r-md border border-[var(--sd-line)] shadow-[10px_0_30px_color-mix(in_oklch,var(--ink)_16%,transparent),4px_0_12px_color-mix(in_oklch,var(--ink)_10%,transparent)]"
        )}
      >
        <WorkspacePill
          collapsed={effectiveCollapsed}
          pinnedCollapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />

        {/* Scroll column. Rows dissolve into the footer through the bottom
            mask-fade rather than hard-clipping; the scrollbar stays invisible
            until the pointer is actually in here (§1.8). */}
        <div className="sd-scroll-hover mask-fade-out flex-1 space-y-5 overflow-y-auto overflow-x-hidden pb-10">
          {/* MAIN — no section header; the labels speak for themselves (§1.3). */}
          <PersistentNav collapsed={effectiveCollapsed} />

          {/* AREAS — the header is itself the link to /areas, with the tree
              nested beneath it as proper children. */}
          <section>
            <SectionHeader
              label="Areas"
              href="/areas"
              collapsed={effectiveCollapsed}
              count={activeAreas.length}
              action={
                <AreaCreateDialog
                  userId={userId}
                  addOptimisticArea={addOptimisticArea}
                  currentAreaCount={activeAreas.length}
                >
                  <button
                    type="button"
                    aria-label="Create area"
                    className={cn(
                      SB_GHOST,
                      SB_FOCUS,
                      "inline-flex h-5 w-5 items-center justify-center text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)]",
                      // Reveal-on-group-hover (§11). Focus-visible forces it
                      // back so the control stays keyboard-reachable.
                      "opacity-0 duration-300 group-hover/section:opacity-30 hover:!opacity-100 focus-visible:!opacity-100"
                    )}
                  >
                    <Plus size={14} strokeWidth={1.75} />
                  </button>
                </AreaCreateDialog>
              }
            />

            {/* The tree is hidden in the collapsed rail — bare emoji glyphs read
                poorly at 56px (issue #26). The header link above keeps the
                section reachable; the tree returns on hover-expand / pinned. */}
            {!effectiveCollapsed && (
              <SidebarTree
                userId={userId}
                areas={areas}
                collapsed={effectiveCollapsed}
                graduationYear={graduationYear}
                addOptimisticArea={addOptimisticArea}
              />
            )}
          </section>

        </div>

        {/* Footer stack: SYSTEM → status → identity → utility strip (§1.3, §1.5–§1.7).
            SYSTEM is PINNED here rather than living at the bottom of the scroll
            column. In the column it fell below the fold on a 900px viewport, so
            Settings — the row you reach for when something is wrong — was only
            reachable by scrolling past fifteen others. Pinned, it keeps the §1.3
            vertical order (still below AREAS) and is always visible. */}
        <div className="shrink-0 space-y-1">
          <section>
            <SectionHeader label="System" collapsed={effectiveCollapsed} />
            <SidebarSystemNav collapsed={effectiveCollapsed} />
          </section>

          <SidebarStatusRow collapsed={effectiveCollapsed} />
          <IdentityBlock collapsed={effectiveCollapsed} profile={profile} />
          <UtilityStrip
            collapsed={effectiveCollapsed}
            showArchived={showArchived}
            toggleShowArchived={toggleShowArchived}
          />
        </div>
      </div>
    </aside>
  );
}

/**
 * Workspace pill (§1.1) — the brand marriage: their pill grammar wrapped around
 * our serif logotype, which is the one place EB Garamond is still allowed.
 *
 * The chevron opens a real menu rather than being decorative; collapse lives
 * there. Collapsed, the pill becomes a 36px logo tile that pins the sidebar
 * back open in one click.
 */
function WorkspacePill({
  collapsed,
  pinnedCollapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  pinnedCollapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  if (collapsed) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label="Pin sidebar open"
              className={cn(
                SB_FOCUS,
                "mx-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]",
                "border border-[color-mix(in_oklch,var(--sd-line)_50%,transparent)] bg-[var(--sd-box)]",
                "text-[15px] leading-none transition-colors duration-[120ms] ease-out hover:bg-[var(--sd-hover)]"
              )}
            >
              <Logotype collapsed />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Pin sidebar open</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Workspace menu"
          className={cn(
            SB_FOCUS,
            "flex h-9 w-full shrink-0 items-center gap-2 rounded-[10px] px-3",
            "border border-[color-mix(in_oklch,var(--sd-line)_50%,transparent)] bg-[var(--sd-box)]",
            "transition-colors duration-[120ms] ease-out hover:bg-[var(--sd-hover)]",
            "data-[state=open]:bg-[var(--sd-hover)]"
          )}
        >
          {/* Status dot — cyan stays functional chrome: it says "connected". */}
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-[var(--hud-cyan)]"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-left text-[15px] leading-none">
            <Logotype />
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            className="shrink-0 text-[var(--sd-ink-faint)]"
            aria-hidden="true"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[204px]">
        <DropdownMenuItem onSelect={onToggleCollapsed}>
          {pinnedCollapsed ? (
            <PanelLeftOpen size={14} strokeWidth={1.75} />
          ) : (
            <PanelLeftClose size={14} strokeWidth={1.75} />
          )}
          {pinnedCollapsed ? "Pin sidebar open" : "Collapse sidebar"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/settings">
            <Settings size={14} strokeWidth={1.75} />
            Settings
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Section header (§1.3 + §11). Sans, not mono — their headers are sans, and the
 * mono register is reserved for genuinely numeric micro-labels.
 *
 * The action icon is invisible until the section is hovered, which is what
 * keeps the column quiet at rest. `group/section` scopes the reveal so hovering
 * one section never lights up another.
 */
function SectionHeader({
  label,
  href,
  collapsed,
  count,
  action,
}: {
  label: string;
  href?: string;
  collapsed: boolean;
  count?: number;
  action?: React.ReactNode;
}) {
  // The collapsed rail is icons-only: a 56px column can't carry a caps label,
  // and a hairline reads as section separation better than truncated text.
  if (collapsed) {
    return <div className="mx-auto my-2 h-px w-6 bg-[var(--sd-line)]" aria-hidden="true" />;
  }

  const labelClasses =
    "text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sd-ink-faint)] transition-colors duration-[120ms] ease-out";

  return (
    <div className="group/section mb-1 flex h-6 items-center gap-1.5 px-2">
      {href ? (
        <a
          href={href}
          className={cn(labelClasses, SB_FOCUS, "rounded-[4px] hover:text-[var(--sd-ink)]")}
        >
          {label}
        </a>
      ) : (
        <span className={cn(labelClasses, "select-none")}>{label}</span>
      )}

      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "flex h-[19px] min-w-[20px] items-center justify-center rounded-full px-1",
            "border border-[color-mix(in_oklch,var(--sd-line)_40%,transparent)]",
            "text-[9px] font-medium tabular-nums text-[var(--sd-ink-faint)]"
          )}
        >
          {count}
        </span>
      )}

      {action && <span className="ml-auto flex items-center">{action}</span>}
    </div>
  );
}

/**
 * Avatar image with onError → initial fallback. Covers three cases: no avatar
 * at all, a `src` whose remote image fails (dead Google avatar URL, CORS block,
 * signed-out OAuth picture), and the happy path.
 */
function AvatarOrInitial({
  src,
  initial,
}: {
  src: string | null | undefined;
  initial: string;
}) {
  const [failed, setFailed] = useState(false);
  const showInitial = !src || failed;
  if (showInitial) {
    return (
      <span className="flex h-full w-full items-center justify-center bg-[var(--sd-box)] text-[13px] text-[var(--sd-ink-dull)]">
        {initial}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  );
}

/**
 * Identity block (§1.6) — a plain row, deliberately not a card. Card chrome
 * here competed with the entity cards on the canvas for the same "raised"
 * signal; a bare row lets the workspace pill stay the only raised thing in the
 * column.
 */
function IdentityBlock({
  collapsed,
  profile,
}: {
  collapsed: boolean;
  profile: Props["profile"];
}) {
  const src = profile.avatarUrl || profile.oauthAvatarUrl;
  const initial = (profile.displayName?.trim() || profile.email || "·").charAt(0).toUpperCase();
  const primaryLabel = profile.displayName?.trim() || profile.email;

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href="/settings"
              aria-label={`Open settings — signed in as ${primaryLabel}`}
              className={cn(
                SB_FOCUS,
                "mx-auto block h-7 w-7 overflow-hidden rounded-[8px] border border-[var(--sd-line)]",
                "cursor-pointer-always transition-colors duration-[120ms] hover:border-[var(--edge-hud)]"
              )}
            >
              <AvatarOrInitial src={src} initial={initial} />
            </a>
          </TooltipTrigger>
          <TooltipContent side="right">{primaryLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <a
      href="/settings"
      className={cn(
        SB_FOCUS,
        "group flex h-12 items-center gap-2.5 rounded-[6px] px-2",
        "cursor-pointer-always transition-colors duration-[120ms] ease-out hover:bg-[var(--sd-hover)]"
      )}
    >
      <span
        className={cn(
          "h-7 w-7 shrink-0 overflow-hidden rounded-[8px] border border-[var(--sd-line)]",
          "transition-colors duration-[120ms] group-hover:border-[var(--edge-hud)]"
        )}
      >
        <AvatarOrInitial src={src} initial={initial} />
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[13px] font-medium text-[var(--sd-ink)]">
          {primaryLabel}
        </span>
        <span className="truncate text-[11px] text-[var(--sd-ink-faint)]">
          {profile.displayName?.trim() ? profile.email : "Open settings"}
        </span>
      </span>
    </a>
  );
}

/**
 * Bottom utility strip (§1.7). Four 32px icon buttons left — archived-eye,
 * theme, sound, settings — and everything outward-facing (license, source,
 * site, about) folded into a single overflow menu on the right.
 *
 * The footer aphorism is gone from here on purpose: it lives on the landing
 * page, where a reader has room for it. In a 230px column it was just noise
 * under the controls.
 */
function UtilityStrip({
  collapsed,
  showArchived,
  toggleShowArchived,
}: {
  collapsed: boolean;
  showArchived: boolean;
  toggleShowArchived: () => void;
}) {
  const sfxMuted = useSfxMuted();

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex items-center",
          collapsed ? "flex-col gap-1" : "h-10 justify-between"
        )}
      >
        <div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "gap-0.5")}>
          <UtilityButton
            label={showArchived ? "Hide archived" : "Show archived"}
            onClick={toggleShowArchived}
            active={showArchived}
            side={collapsed ? "right" : "top"}
          >
            {showArchived ? <Eye size={16} /> : <EyeOff size={16} />}
          </UtilityButton>

          <ThemeButton side={collapsed ? "right" : "top"} />

          <UtilityButton
            label={sfxMuted ? "Sound effects off" : "Sound effects on"}
            onClick={() => setSfxMuted(!sfxMuted)}
            active={!sfxMuted}
            side={collapsed ? "right" : "top"}
          >
            {sfxMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </UtilityButton>

          <UtilityButton
            label="Settings"
            href="/settings"
            side={collapsed ? "right" : "top"}
          >
            <Settings size={16} />
          </UtilityButton>
        </div>

        <OverflowMenu collapsed={collapsed} />
      </div>
    </TooltipProvider>
  );
}

/** 32px icon button — the utility-strip unit. */
function UtilityButton({
  label,
  onClick,
  href,
  active = false,
  side = "top",
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  active?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  children: React.ReactNode;
}) {
  const cls = cn(
    "inline-flex h-8 w-8 items-center justify-center rounded-[8px]",
    "cursor-pointer-always transition-colors duration-[120ms] ease-out",
    SB_FOCUS,
    active
      ? "bg-[color-mix(in_oklch,var(--sd-selected)_40%,transparent)] text-[var(--sd-ink)]"
      : "text-[var(--sd-ink-dull)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]"
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <a href={href} aria-label={label} className={cls}>
            {children}
          </a>
        ) : (
          <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className={cls}>
            {children}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Theme button in utility-strip geometry. Uses the same next-themes hook as the
 * shared ThemeToggle, but that component is a 36px border-on-hover control —
 * off-grammar for this strip — so the strip owns its own 32px presentation and
 * ThemeToggle stays as-is for the settings page.
 *
 * Mount guard: SSR can't read localStorage, so render a same-size placeholder
 * until the client knows the theme. Without it, the icon flashes wrong.
 */
function ThemeButton({ side }: { side: "top" | "right" | "bottom" | "left" }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="h-8 w-8" aria-hidden="true" />;

  const isDark = resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";

  return (
    <UtilityButton label={`Switch to ${next} mode`} onClick={() => setTheme(next)} side={side}>
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </UtilityButton>
  );
}

/**
 * The license / source / site trio, plus "About Kiwi", folded into one overflow
 * menu (§1.7). These are all outward-facing links you touch approximately never
 * — as four bare icons they took the same visual weight as the controls you use
 * daily.
 */
function OverflowMenu({ collapsed }: { collapsed: boolean }) {
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger
              aria-label="More"
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-[8px]",
                "cursor-pointer-always text-[var(--sd-ink-dull)] transition-colors duration-[120ms] ease-out",
                "hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]",
                "data-[state=open]:bg-[var(--sd-hover)] data-[state=open]:text-[var(--sd-ink)]",
                SB_FOCUS
              )}
            >
              <MoreHorizontal size={16} />
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side={collapsed ? "right" : "top"}>More</TooltipContent>
        </Tooltip>

        <DropdownMenuContent align={collapsed ? "start" : "end"} side="top" className="w-[196px]">
          <DropdownMenuItem onSelect={() => setAboutOpen(true)}>
            <Info size={14} strokeWidth={1.75} />
            About Kiwi
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="https://github.com/filippo-fonseca/hyperpolymath-v2" target="_blank" rel="noopener noreferrer">
              <Github size={14} strokeWidth={1.75} />
              Source
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="https://filippofonseca.com" target="_blank" rel="noopener noreferrer">
              <Globe size={14} strokeWidth={1.75} />
              filippofonseca.com
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener noreferrer">
              <Scale size={14} strokeWidth={1.75} />
              MIT License
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rendered as a sibling, not inside the menu item: a Dialog unmounts with
          its trigger, and the menu closes on select — nesting them would tear
          the dialog down on the same frame it opened. */}
      <KiwiAboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  );
}
