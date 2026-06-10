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
  Waypoints,
  Folder,
  X,
  Columns2,
} from "lucide-react";
import { KiwiIcon } from "@/components/shared/KiwiIcon";
import { cn } from "@/lib/utils";
import { useSplitScreen } from "@/lib/ui/useSplitScreen";

const JARVIS_PATH = "/today";
const FALLBACK_LEFT_PATH = "/lifeos";
const STORAGE_KEY = "top-tab-last-route";

const ROUTE_META: Record<
  string,
  {
    label: string;
    icon: (props: {
      size?: number;
      strokeWidth?: number;
      className?: string;
    }) => React.ReactNode;
  }
> = {
  "/lifeos": { label: "LifeOS", icon: LayoutDashboard },
  "/tasks": { label: "Tasks", icon: CheckSquare },
  "/habits": { label: "Habits", icon: Repeat },
  "/training": { label: "Training", icon: Dumbbell },
  "/captures": { label: "Captures", icon: MessageSquare },
  "/calendar": { label: "Calendar", icon: Calendar },
  "/graph": { label: "Graph", icon: Waypoints },
  "/insights": { label: "Insights", icon: BarChart2 },
  "/settings": { label: "Settings", icon: Settings },
  "/areas": { label: "Areas", icon: Network },
};

function metaForPath(pathname: string): {
  label: string;
  icon: (props: {
    size?: number;
    strokeWidth?: number;
    className?: string;
  }) => React.ReactNode;
} {
  if (ROUTE_META[pathname]) return ROUTE_META[pathname];
  const segs = pathname.split("/").filter(Boolean);
  while (segs.length > 0) {
    const candidate = "/" + segs.join("/");
    if (ROUTE_META[candidate]) return ROUTE_META[candidate];
    segs.pop();
  }
  const first = pathname.split("/").filter(Boolean)[0] ?? "Page";
  return {
    label: first.charAt(0).toUpperCase() + first.slice(1),
    icon: Folder,
  };
}

/**
 * TopTabBar — Arc/Safari-style tab strip pinned above the main scroll area.
 *
 * macOS-app aesthetic: hairline divider beneath the bar, soft pill tabs that
 * fill with --surface-raised when active (no thick borders, no halo glow).
 * JARVIS reads as the agent surface via a small cyan dot + ink-on-cyan label
 * — never a full chrome-flood.
 *
 * Split-screen affordance: a quiet vertical-split glyph between the two tabs.
 * When split is on, both routes render simultaneously (70% / 30%) so
 * switching tabs swaps the left pane only.
 *
 * Keyboard shortcuts (handled in GlobalHotkeys, NOT here):
 *   Ctrl+1 → left tab · Ctrl+2 → JARVIS. Both no-op while split-screen is on.
 */
export function TopTabBar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { splitOn, toggle: toggleSplit } = useSplitScreen();

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

  const onJarvis =
    pathname === JARVIS_PATH || pathname.startsWith(JARVIS_PATH + "/");
  const leftPath = onJarvis ? lastRoute : pathname || FALLBACK_LEFT_PATH;
  const leftMeta = metaForPath(leftPath);
  const LeftIcon = leftMeta.icon;

  if (pathname.startsWith("/onboarding")) return null;

  return (
    <div
      role="tablist"
      aria-label="App tabs"
      className="relative flex items-center gap-1 px-3 py-1.5 border-b border-[var(--edge)] bg-[var(--canvas)]"
      style={{ minHeight: 40 }}
    >
      <TabPill
        href={leftPath}
        active={!onJarvis && !splitOn}
        accent={false}
        label={leftMeta.label}
        icon={<LeftIcon size={13} strokeWidth={1.75} />}
        kbd="⌃1"
        onClose={
          onJarvis
            ? undefined
            : () => {
                router.push(JARVIS_PATH);
              }
        }
      />

      <SplitToggle on={splitOn} onClick={toggleSplit} />

      <TabPill
        href={JARVIS_PATH}
        active={onJarvis || splitOn}
        accent
        label="JARVIS"
        kbd="⌃2"
        icon={<KiwiIcon size={13} aria-hidden="true" />}
      />
    </div>
  );
}

function SplitToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? "Exit split screen" : "Enter split screen"}
      title={on ? "Exit split screen" : "Split screen with JARVIS"}
      className={cn(
        "agent-mode-scope inline-flex h-6 w-6 items-center justify-center rounded-md",
        "transition-[background-color,color] duration-150 ease-out",
        on
          ? "bg-[color-mix(in_oklch,var(--hud-cyan)_14%,transparent)] text-[var(--hud-cyan)]"
          : "text-[var(--ink-muted)] hover:bg-[color-mix(in_oklch,var(--ink)_5%,transparent)] hover:text-[var(--ink)]",
      )}
    >
      <Columns2 size={12} strokeWidth={1.75} />
    </button>
  );
}

function TabPill({
  href,
  active,
  accent,
  label,
  icon,
  kbd,
  onClose,
}: {
  href: string;
  active: boolean;
  accent: boolean;
  label: string;
  icon: React.ReactNode;
  kbd?: string;
  onClose?: () => void;
}) {
  // accent (JARVIS) tab: scope cyan focus ring so amber doc ring doesn't show
  // on tab focus. Plain tab keeps the default doc ring.
  const scope = accent ? "agent-mode-scope" : "";

  return (
    <div
      className={cn(
        "group/tab relative flex items-center",
        scope,
        "rounded-md transition-[background-color,color,box-shadow] duration-150 ease-out",
        active
          ? accent
            ? "bg-[color-mix(in_oklch,var(--hud-cyan)_10%,var(--surface-raised))] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--hud-cyan)_35%,transparent)]"
            : "bg-[var(--surface-raised)] shadow-[inset_0_0_0_1px_var(--edge)]"
          : "hover:bg-[color-mix(in_oklch,var(--ink)_4%,transparent)]",
      )}
      role="tab"
      aria-selected={active}
    >
      <Link
        href={href}
        className={cn(
          "flex items-center gap-2 pl-2.5 pr-2 py-1.5 font-sans text-[12px] outline-none rounded-md",
          "tracking-[-0.005em]",
          active
            ? accent
              ? "text-[var(--hud-cyan)] font-medium"
              : "text-[var(--ink)] font-medium"
            : "text-[var(--ink-muted)] hover:text-[var(--ink)]",
        )}
      >
        {accent && active && (
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
            style={{
              backgroundColor: "var(--hud-cyan)",
              boxShadow:
                "0 0 6px color-mix(in oklch, var(--hud-cyan) 70%, transparent)",
            }}
          />
        )}
        <span
          className="shrink-0 inline-flex items-center"
          style={
            accent
              ? {
                  color: active ? "var(--hud-cyan)" : "var(--ink-muted)",
                }
              : undefined
          }
        >
          {icon}
        </span>
        <span className="truncate max-w-[160px]">{label}</span>
        {kbd && (
          <span
            className={cn(
              "ml-1 hidden md:inline font-mono text-[9px] tracking-[0.04em] uppercase",
              active ? "opacity-50" : "opacity-40",
              accent ? "text-[var(--hud-cyan)]" : "text-[var(--ink-muted)]",
            )}
            aria-hidden
          >
            {kbd}
          </span>
        )}
      </Link>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${label} tab`}
          className={cn(
            "mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-sm",
            "text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[color-mix(in_oklch,var(--ink)_8%,transparent)]",
            "opacity-0 group-hover/tab:opacity-100 transition-opacity duration-100",
          )}
        >
          <X size={10} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
