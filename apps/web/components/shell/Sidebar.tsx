"use client";

import { useEffect, useOptimistic, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Eye,
  EyeOff,
  Settings,
  Network,
  Github,
  Scale,
  Globe,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Wordmark } from "./Wordmark";
import { PersistentNav } from "./PersistentNav";
import { SidebarTree } from "./SidebarTree";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { AreaCreateDialog } from "@/components/areas/AreaCreateDialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";
import {
  optimisticReducer,
  type OptimisticAction,
} from "@/lib/realtime/optimistic-reducer";
import { getAreasForCurrentUser } from "@/app/actions/areas";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

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

export type AreaOptimisticDispatch = (
  action: OptimisticAction<SidebarArea>,
) => void;

/**
 * Sidebar — M3 owner of the areas useOptimistic state.
 *
 * AreaCreateDialog and SidebarTree are SIBLINGS of this component. Both consume
 * (and SidebarTree, via context menu, also mutates) the same `areas` list.
 * Per the plan's M3 decision, we lift `useQuery` + `useOptimistic` here and
 * pass `addOptimisticArea` down to both — no React context needed for the
 * direct-child fan-out.
 *
 * Realtime subscriptions for both `areas` and `projects` live here too —
 * SidebarTree mutates projects (drag reorder, context-menu rename/archive),
 * so subscribing at the shared parent guarantees one channel per (table, userId)
 * regardless of how many sub-rows mount.
 *
 * Phase 6.1 Plan 06.1-05 (UI-SPEC §5e + §7a + §12e):
 *
 * Diplomatic chrome. --surface background, 1px --edge right border. Section
 * labels render as mono 12px uppercase tracking-wide (AREAS / JARVIS /
 * NAVIGATE per UI-SPEC §12e). The active route's nav link gets a 1px
 * --edge-hud LEFT-edge accent (not a background fill); the JARVIS link
 * additionally gets a 4px --hud-cyan dot when /jarvis is current — the one
 * place cyan touches diplomatic chrome (UI-SPEC §5e). Hover transitions
 * 100ms text-muted → ink.
 *
 * Layout grid carries forward unchanged (UI-SPEC §14). Mechanism for
 * optimistic state + Realtime + collapse state is untouched — ONLY
 * typography + edges + copy register update.
 */
export function Sidebar({
  userId,
  initialActiveAreas,
  initialAllAreas,
  graduationYear,
  profile,
}: Props) {
  // Hydration safety (Pitfall 16): Read localStorage inside useEffect, NOT during render.
  const [collapsed, setCollapsed] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const storedCollapsed = localStorage.getItem("sidebar-collapsed");
    const storedShowArchived = localStorage.getItem("sidebar-show-archived");
    if (storedCollapsed === "true") setCollapsed(true);
    if (storedShowArchived === "true") setShowArchived(true);
    setMounted(true);
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  function toggleShowArchived() {
    const next = !showArchived;
    setShowArchived(next);
    localStorage.setItem("sidebar-show-archived", String(next));
  }

  // Singleton channels for both tables — sidebar is the canonical mount point.
  // SidebarTree children also mount these (refcounted), keeping the count at 1
  // per (table, userId) regardless of UI re-renders.
  useTableSubscription("areas", userId);
  useTableSubscription("projects", userId);

  // Active-areas list is the canonical optimistic source (the hot path —
  // create, rename, reorder all happen here). When `showArchived` is toggled,
  // we display from `initialAllAreas` (not optimized; rare path).
  const { data: activeAreas = initialActiveAreas } = useQuery({
    queryKey: tableKey("areas", userId),
    queryFn: getAreasForCurrentUser,
    initialData: initialActiveAreas,
    // Phase 5.1 D-P2 #1 / JARVIS-21: treat the SSR-provided initialData as
    // fresh at mount time. Without this, TanStack 5 treats initialData as
    // updatedAt=0 (instantly stale) — any invalidateQueries call on this key
    // (e.g. from a JARVIS Server Action) triggers an immediate background
    // refetch even though the data hasn't changed. Realtime (useTableSubscription
    // above) remains the legitimate update path for actual areas table changes.
    initialDataUpdatedAt: Date.now(),
    staleTime: Infinity,
  });

  const [optimisticAreas, addOptimisticArea] = useOptimistic(
    activeAreas,
    optimisticReducer<SidebarArea>,
  );

  const areas = showArchived ? initialAllAreas : optimisticAreas;

  return (
    <aside
      className={cn(
        "group/sidebar flex flex-col h-full bg-[var(--surface)] border-r border-[var(--edge)] shrink-0 overflow-hidden",
        "transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16" : "w-[260px]",
        // Prevent layout shift before mounted (localStorage read)
        !mounted && "invisible",
      )}
      aria-label="Sidebar"
    >
      {/* Header: Wordmark + collapse toggle.
          When collapsed, the 64px row is too narrow for both glyphs at once,
          so the H wordmark owns the whole row and the chevron only fades in
          on hover/focus (positioned absolutely so it overlays the H instead
          of pushing it). */}
      <div className="relative flex items-center justify-between px-3 py-3 border-b border-[var(--edge)]">
        <Wordmark collapsed={collapsed} />
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleCollapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className={cn(
                  "shrink-0 text-[var(--ink-muted)] hover:text-[var(--ink)] transition-[opacity,color] duration-150 ease-out",
                  collapsed &&
                    "absolute right-2 top-1/2 -translate-y-1/2 bg-[var(--surface)] opacity-0 pointer-events-none group-hover/sidebar:opacity-100 group-hover/sidebar:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto",
                )}
              >
                {collapsed ? (
                  <ChevronRight size={14} strokeWidth={1.5} />
                ) : (
                  <ChevronLeft size={14} strokeWidth={1.5} />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        {/* Primary nav — labels speak for themselves now; section header
            removed for the cleaner Arc-style layout. */}
        <PersistentNav collapsed={collapsed} />

        {/* AREAS section — heading is now the parent link to /areas, with
            the area tree nested beneath as proper children. Active styling
            applies on the homepage AND any /areas/[id] detail page so the
            user always knows the section is "current". */}
        <div className="mt-6">
          {!collapsed && (
            <div className="flex items-center justify-between px-2 mb-1.5">
              <AreasParentLink />
              <AreaCreateDialog
                userId={userId}
                addOptimisticArea={addOptimisticArea}
                currentAreaCount={activeAreas.length}
              >
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Create area"
                  className="text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 ease-out"
                >
                  <Plus size={12} strokeWidth={1.5} />
                </Button>
              </AreaCreateDialog>
            </div>
          )}

          {collapsed && (
            <div className="flex flex-col items-center gap-1 py-1">
              {/* Collapsed-mode Areas link — keeps the homepage one click
                  away when the sidebar is narrow. */}
              <AreasParentLink collapsed />
              <AreaCreateDialog
                userId={userId}
                addOptimisticArea={addOptimisticArea}
                currentAreaCount={activeAreas.length}
              >
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Create area"
                        className="text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-100 ease-out"
                      >
                        <Plus size={12} strokeWidth={1.5} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Create area</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </AreaCreateDialog>
            </div>
          )}

          <SidebarTree
            userId={userId}
            areas={areas}
            collapsed={collapsed}
            graduationYear={graduationYear}
            addOptimisticArea={addOptimisticArea}
          />
        </div>

        {/* JARVIS section — agent-adjacent surfaces (memory + future agent destinations) */}
        {!collapsed && (
          <div className="mt-6 px-4 mb-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color-mix(in_oklch,var(--ink-muted)_75%,transparent)] select-none">
              JARVIS
            </span>
          </div>
        )}
        {!collapsed && (
          <nav aria-label="JARVIS navigation" className="px-2">
            <SidebarSectionLink href="/settings/memory" label="Memory" />
          </nav>
        )}
      </div>

      {/* Footer — user chip, icon row, meta. Restructured for clarity:
          identity at top (avatar + display name), icon controls in the
          middle (eye / theme / settings, all uniform size), brand meta
          at the bottom. */}
      <div className="border-t border-[var(--edge)] px-3 py-3 shrink-0 space-y-3">
        <UserChip collapsed={collapsed} profile={profile} />

        <SidebarIconRow
          collapsed={collapsed}
          showArchived={showArchived}
          toggleShowArchived={toggleShowArchived}
        />

        {!collapsed ? (
          <div className="pt-3 border-t border-[var(--edge)] space-y-2">
            <TooltipProvider delayDuration={300}>
              <div className="flex items-center justify-around text-[var(--ink-muted)]">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href="https://opensource.org/licenses/MIT"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="MIT License"
                      className="inline-flex w-7 h-7 items-center justify-center rounded-md hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors"
                    >
                      <Scale size={13} strokeWidth={1.5} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="top">MIT License</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href="https://github.com/filippo-fonseca/hyperpolymath-v2"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="GitHub repo"
                      className="inline-flex w-7 h-7 items-center justify-center rounded-md hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors"
                    >
                      <Github size={13} strokeWidth={1.5} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="top">github.com/filippo-fonseca</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href="https://filippofonseca.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="filippofonseca.com"
                      className="inline-flex w-7 h-7 items-center justify-center rounded-md hover:text-[var(--ink)] hover:bg-[var(--surface)] transition-colors"
                    >
                      <Globe size={13} strokeWidth={1.5} />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent side="top">filippofonseca.com</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
            <p className="text-center font-serif italic text-[11px] leading-[1.45] text-[var(--ink-muted)] px-1">
              how you do one thing is how you do everything.
            </p>
          </div>
        ) : (
          <div className="pt-2 border-t border-[var(--edge)] text-center">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href="https://github.com/filippo-fonseca/hyperpolymath-v2"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-[14px] text-[var(--ink-muted)] opacity-40 hover:opacity-100 hover:text-[var(--ink)] transition-all select-none"
                    aria-label="MIT licensed · github.com/filippo-fonseca"
                  >
                    ⚜
                  </a>
                </TooltipTrigger>
                <TooltipContent side="right">
                  MIT · github.com/filippo-fonseca
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    </aside>
  );
}

/**
 * Section parent link for AREAS. Replaces the static mono eyebrow with a
 * proper clickable parent → /areas, active-styled while on the homepage or
 * any area detail page. Visually sits between the eyebrow register (mono
 * caps) and a nav row — it reads as a label but behaves like a link.
 */
function AreasParentLink({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const active = !!pathname?.startsWith("/areas");

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href="/areas"
              aria-label="Areas homepage"
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex w-7 h-7 items-center justify-center rounded-md transition-colors duration-100 cursor-pointer-always",
                active
                  ? "text-[var(--ink)] bg-[color-mix(in_oklch,var(--hud-cyan)_14%,transparent)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
              )}
            >
              <Network size={14} strokeWidth={1.5} />
            </a>
          </TooltipTrigger>
          <TooltipContent side="right">Areas</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <a
      href="/areas"
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 -mx-1",
        "font-mono text-[10px] uppercase tracking-[0.12em]",
        "transition-colors duration-100 cursor-pointer-always",
        active
          ? "text-[var(--ink)]"
          : "text-[color-mix(in_oklch,var(--ink-muted)_75%,transparent)] hover:text-[var(--ink)]",
      )}
    >
      <Network
        size={11}
        strokeWidth={1.5}
        className={active ? "text-[var(--hud-cyan)]" : undefined}
      />
      <span>Areas</span>
    </a>
  );
}

/**
 * Avatar image with onError → initial fallback. Handles three cases:
 *   1. `src` is null/empty (no uploaded avatar AND no OAuth avatar URL).
 *   2. `src` is a string but the remote image fails to load (Google avatar
 *      404, CORS block, dead cache URL, signed-out OAuth picture, etc.).
 *   3. `src` loads successfully — shown normally.
 * In cases (1) and (2), we render the user's first initial in a serif span.
 */
function AvatarOrInitial({
  src,
  initial,
  textSize,
}: {
  src: string | null | undefined;
  initial: string;
  textSize: string;
}) {
  const [failed, setFailed] = useState(false);
  const showInitial = !src || failed;
  if (showInitial) {
    return (
      <span
        className={`w-full h-full flex items-center justify-center bg-[var(--surface)] font-serif ${textSize} text-[var(--ink-muted)]`}
      >
        {initial}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src!}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  );
}

/**
 * User identity chip. Avatar (uploaded → OAuth → initial fallback chain),
 * display name (with email beneath when present), entire chip clickable
 * → /settings. Collapsed form is just the avatar with tooltip.
 */
function UserChip({
  collapsed,
  profile,
}: {
  collapsed: boolean;
  profile: Props["profile"];
}) {
  const src = profile.avatarUrl || profile.oauthAvatarUrl;
  const initial =
    (profile.displayName?.trim() || profile.email || "·")
      .charAt(0)
      .toUpperCase();
  const primaryLabel = profile.displayName?.trim() || profile.email;

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href="/settings"
              aria-label={`Open settings — signed in as ${primaryLabel}`}
              className="block mx-auto w-8 h-8 rounded-full overflow-hidden border border-[var(--edge)] hover:border-[var(--edge-hud)] transition-colors duration-150 cursor-pointer-always"
            >
              <AvatarOrInitial src={src} initial={initial} textSize="text-sm" />
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
      className="group flex items-center gap-3 -mx-1 px-2 py-1.5 rounded-md hover:bg-[var(--surface)] transition-colors duration-150 cursor-pointer-always"
    >
      <div className="w-9 h-9 rounded-full overflow-hidden border border-[var(--edge)] group-hover:border-[var(--edge-hud)] transition-colors duration-150 shrink-0">
        <AvatarOrInitial src={src} initial={initial} textSize="text-base" />
      </div>
      <div className="flex flex-col min-w-0 leading-tight">
        <span className="font-serif text-sm text-[var(--ink)] truncate">
          {primaryLabel}
        </span>
        {profile.displayName?.trim() ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)] truncate">
            {profile.email}
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--ink-muted)]">
            Open settings
          </span>
        )}
      </div>
    </a>
  );
}

/**
 * Uniform icon row — three small icon buttons (archived eye, theme, settings).
 * All 28×28 hit targets, matching size, hairline borders on hover. Replaces
 * the prior "Hide archived" text button + bare ThemeToggle + nothing-for-
 * settings layout, which read as three different things side-by-side.
 */
function SidebarIconRow({
  collapsed,
  showArchived,
  toggleShowArchived,
}: {
  collapsed: boolean;
  showArchived: boolean;
  toggleShowArchived: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1",
        collapsed ? "flex-col" : "justify-between",
      )}
    >
      <SidebarIconButton
        label={showArchived ? "Hide archived" : "Show archived"}
        onClick={toggleShowArchived}
        active={showArchived}
        side={collapsed ? "right" : "top"}
      >
        {showArchived ? <Eye size={14} /> : <EyeOff size={14} />}
      </SidebarIconButton>

      {/* ThemeToggle already renders its own icon at 36px; we wrap it in a
          28px slot so the row stays visually uniform. The toggle internally
          handles the sun/moon swap + system-pref tracking. */}
      <div className="inline-flex">
        <ThemeToggle variant="header" />
      </div>

      <SidebarIconButton
        label="Settings"
        href="/settings"
        side={collapsed ? "right" : "top"}
      >
        <Settings size={14} />
      </SidebarIconButton>
    </div>
  );
}

function SidebarIconButton({
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
    "inline-flex items-center justify-center w-7 h-7 rounded-md border transition-colors duration-150 cursor-pointer-always",
    active
      ? "border-[var(--edge-hud)] bg-[var(--surface-raised)] text-[var(--ink)]"
      : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)] hover:border-[var(--edge)] hover:bg-[var(--surface)]",
  );
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          {href ? (
            <a href={href} aria-label={label} className={cls}>
              {children}
            </a>
          ) : (
            <button
              type="button"
              onClick={onClick}
              aria-label={label}
              aria-pressed={active}
              className={cls}
            >
              {children}
            </button>
          )}
        </TooltipTrigger>
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Local sibling component used by the JARVIS sub-section. Mirrors the
 * active-edge accent style used by PersistentNav so behavior is consistent.
 * Kept local to avoid a circular export chain with PersistentNav.
 *
 * Active-route detection mirrors PersistentNav's `pathname?.startsWith(href)`
 * convention. When active, the link draws a 1px --edge-hud LEFT-edge accent
 * (UI-SPEC §5e — diplomatic chrome active-state register). Hover transition
 * runs at 100ms per UI-SPEC §7a Sidebar motion.
 */
function SidebarSectionLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const pathname = usePathname();
  const isActive = !!pathname?.startsWith(href);
  return (
    <a
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "mx-2 flex items-center gap-3 rounded-lg px-3 h-9",
        "font-serif text-[14px] tracking-tight",
        "transition-all duration-150 ease-out cursor-pointer-always",
        isActive
          ? "text-[var(--ink)] font-medium"
          : "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[color-mix(in_oklch,var(--ink)_4%,transparent)]",
      )}
      style={
        isActive
          ? {
              background:
                "linear-gradient(95deg, color-mix(in oklch, var(--hud-cyan) 22%, transparent) 0%, color-mix(in oklch, var(--hud-cyan) 8%, transparent) 60%, transparent 100%)",
              boxShadow:
                "0 0 24px color-mix(in oklch, var(--hud-cyan) 14%, transparent), inset 0 0 0 1px color-mix(in oklch, var(--hud-cyan) 28%, transparent)",
            }
          : undefined
      }
    >
      {label}
    </a>
  );
}
