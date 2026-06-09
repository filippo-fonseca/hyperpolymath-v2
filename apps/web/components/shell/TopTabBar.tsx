"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CheckSquare,
  MessageSquare,
  Calendar,
  Settings,
  BarChart2,
  Repeat,
  LayoutDashboard,
  Dumbbell,
  Network,
  Folder,
  X,
} from "lucide-react";
import { KiwiIcon } from "@/components/shared/KiwiIcon";
import { cn } from "@/lib/utils";

const JARVIS_PATH = "/today";
const FALLBACK_LEFT_PATH = "/lifeos";
const STORAGE_KEY = "top-tab-last-route";

/**
 * Route lookup for the left tab — keeps icon/label parity with the sidebar
 * destinations. /today is intentionally absent because JARVIS owns the
 * right tab. Anything not in this map (e.g. /projects/[id]) falls through
 * to a generic Folder icon + slug-derived label.
 */
const ROUTE_META: Record<
  string,
  { label: string; icon: (props: { size?: number; strokeWidth?: number; className?: string }) => React.ReactNode }
> = {
  "/lifeos": { label: "LifeOS", icon: LayoutDashboard },
  "/tasks": { label: "Tasks", icon: CheckSquare },
  "/habits": { label: "Habits", icon: Repeat },
  "/training": { label: "Training", icon: Dumbbell },
  "/captures": { label: "Captures", icon: MessageSquare },
  "/calendar": { label: "Calendar", icon: Calendar },
  "/insights": { label: "Insights", icon: BarChart2 },
  "/settings": { label: "Settings", icon: Settings },
  "/areas": { label: "Areas", icon: Network },
};

function metaForPath(pathname: string): {
  label: string;
  icon: (props: { size?: number; strokeWidth?: number; className?: string }) => React.ReactNode;
} {
  // Exact match first
  if (ROUTE_META[pathname]) return ROUTE_META[pathname];
  // Then longest-prefix match (/projects/abc → /projects)
  const segs = pathname.split("/").filter(Boolean);
  while (segs.length > 0) {
    const candidate = "/" + segs.join("/");
    if (ROUTE_META[candidate]) return ROUTE_META[candidate];
    segs.pop();
  }
  // Fallback: derive label from the first segment
  const first = pathname.split("/").filter(Boolean)[0] ?? "Page";
  return {
    label: first.charAt(0).toUpperCase() + first.slice(1),
    icon: Folder,
  };
}

/**
 * TopTabBar — browser-tab metaphor pinned above the main scroll area.
 *
 * Two tabs:
 *   - Left: reflects the current sidebar route. When the user is on /today
 *     (JARVIS), the left tab shows the *previous* non-JARVIS route so
 *     there's always a one-click path back. Defaults to /lifeos on first
 *     load.
 *   - Right: JARVIS, always present. Cyan-tinted when active.
 *
 * Only one route is rendered at a time — the inactive tab is a navigation
 * affordance, not a parallel pane. Split-screen is filed as a backlog item
 * (.planning/phases/999.13-…) and will graduate this bar to a layout owner.
 */
export function TopTabBar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  // Track the most recent non-JARVIS route so the left tab can persist a
  // sensible "go back to what I was doing" target while JARVIS is active.
  const [lastRoute, setLastRoute] = useState<string>(FALLBACK_LEFT_PATH);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setLastRoute(stored);
  }, []);

  useEffect(() => {
    if (pathname && pathname !== JARVIS_PATH) {
      setLastRoute(pathname);
      localStorage.setItem(STORAGE_KEY, pathname);
    }
  }, [pathname]);

  const onJarvis = pathname === JARVIS_PATH || pathname.startsWith(JARVIS_PATH + "/");
  const leftPath = onJarvis ? lastRoute : pathname || FALLBACK_LEFT_PATH;
  const leftMeta = metaForPath(leftPath);
  const LeftIcon = leftMeta.icon;

  // Hide the tab bar entirely on the onboarding flow — it's not a "tab".
  if (pathname.startsWith("/onboarding")) return null;

  return (
    <div
      role="tablist"
      aria-label="App tabs"
      className="relative flex items-end gap-1 px-4 pt-2 border-b border-[var(--edge)] bg-[var(--canvas)]"
      style={{ minHeight: 40 }}
    >
      {/* Left tab — current sidebar route (or last non-JARVIS while on JARVIS) */}
      <TabPill
        href={leftPath}
        active={!onJarvis}
        accent={false}
        label={leftMeta.label}
        icon={<LeftIcon size={13} strokeWidth={1.75} />}
        onClose={
          onJarvis
            ? undefined
            : () => {
                router.push(JARVIS_PATH);
              }
        }
      />

      {/* Right tab — JARVIS, always present, cyan when active */}
      <TabPill
        href={JARVIS_PATH}
        active={onJarvis}
        accent
        label="JARVIS"
        icon={
          <KiwiIcon
            size={13}
            aria-hidden="true"
          />
        }
      />

      {/* Future: split affordance lives here. See .planning/phases/999.13. */}
    </div>
  );
}

function TabPill({
  href,
  active,
  accent,
  label,
  icon,
  onClose,
}: {
  href: string;
  active: boolean;
  accent: boolean;
  label: string;
  icon: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        "group/tab relative flex items-center",
        "rounded-t-md border border-b-0",
        "transition-colors duration-150 ease-out",
        active
          ? "bg-[var(--surface-raised)] border-[var(--edge)] -mb-px"
          : "bg-transparent border-transparent hover:bg-[color-mix(in_oklch,var(--ink)_3%,transparent)]",
      )}
      role="tab"
      aria-selected={active}
    >
      <Link
        href={href}
        className={cn(
          "flex items-center gap-2 pl-3 pr-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.10em] outline-none",
          active
            ? accent
              ? "text-[var(--hud-cyan)]"
              : "text-[var(--ink)]"
            : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
        )}
        style={
          active && accent
            ? {
                textShadow:
                  "0 0 12px color-mix(in oklch, var(--hud-cyan) 50%, transparent)",
              }
            : undefined
        }
      >
        <span
          className="shrink-0"
          style={
            active && accent
              ? {
                  filter:
                    "drop-shadow(0 0 6px color-mix(in oklch, var(--hud-cyan) 70%, transparent))",
                }
              : undefined
          }
        >
          {icon}
        </span>
        <span className="truncate max-w-[160px]">{label}</span>
      </Link>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${label} tab`}
          className={cn(
            "mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-sm",
            "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--edge)]",
            "opacity-0 group-hover/tab:opacity-100 transition-opacity duration-100",
          )}
        >
          <X size={10} strokeWidth={2} />
        </button>
      )}
      {/* Active accent — cyan glow underline for JARVIS, hairline for others */}
      {active && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -bottom-px h-px"
          style={{
            backgroundColor: accent
              ? "var(--hud-cyan)"
              : "var(--surface-raised)",
            boxShadow: accent
              ? "0 0 12px color-mix(in oklch, var(--hud-cyan) 55%, transparent)"
              : undefined,
          }}
        />
      )}
    </div>
  );
}
