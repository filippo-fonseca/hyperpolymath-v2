"use client";

import { KiwiIcon } from "@/components/shared/KiwiIcon";
import { useTodayDailyPage } from "@/lib/pages/useTodayDailyPage";
import { useSplitScreen } from "@/lib/ui/useSplitScreen";
import { cn } from "@/lib/utils";
import {
  BarChart2,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckSquare,
  Columns2,
  Dumbbell,
  Folder,
  LayoutDashboard,
  MessageSquare,
  Network,
  Repeat,
  Settings,
  Users,
  UtensilsCrossed,
  Waypoints,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const JARVIS_PATH = "/today";
const FALLBACK_LEFT_PATH = "/lifeos";
const STORAGE_KEY = "top-tab-last-route";
// Mirror of today's daily-page route, written here so GlobalHotkeys can route
// Ctrl+3 to it without re-querying.
const TODAY_ROUTE_KEY = "top-tab-today-route";

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
  "/nutrition": { label: "Nutrition", icon: UtensilsCrossed },
  "/captures": { label: "Captures", icon: MessageSquare },
  "/calendar": { label: "Calendar", icon: Calendar },
  "/graph": { label: "Graph", icon: Waypoints },
  "/insights": { label: "Insights", icon: BarChart2 },
  "/settings": { label: "Settings", icon: Settings },
  "/journaling": { label: "Journal", icon: BookOpen },
  "/areas": { label: "Areas", icon: Network },
  "/people": { label: "People", icon: Users },
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
export function TopTabBar({ userId }: { userId: string }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { splitOn, setSplitOn } = useSplitScreen();
  const { today } = useTodayDailyPage(userId);

  const [lastRoute, setLastRoute] = useState<string>(FALLBACK_LEFT_PATH);

  // Today's daily page is a pinned tab (issue #92, part 3). It sits outside the
  // dynamic left/JARVIS swap pair, so — like JARVIS — its route must not be
  // remembered as the "last left route" or the two would collapse onto one tab.
  const todayPath = today ? `/wiki/${today.id}` : null;
  const onToday = todayPath !== null && pathname === todayPath;

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setLastRoute(stored);
  }, []);

  useEffect(() => {
    if (pathname && pathname !== JARVIS_PATH && pathname !== todayPath) {
      setLastRoute(pathname);
      localStorage.setItem(STORAGE_KEY, pathname);
    }
  }, [pathname, todayPath]);

  // Expose today's route to GlobalHotkeys (Ctrl+3) via the same localStorage
  // bridge the left tab uses.
  useEffect(() => {
    try {
      if (todayPath) localStorage.setItem(TODAY_ROUTE_KEY, todayPath);
      else localStorage.removeItem(TODAY_ROUTE_KEY);
    } catch {
      // ignore
    }
  }, [todayPath]);

  const onJarvis = pathname === JARVIS_PATH || pathname.startsWith(JARVIS_PATH + "/");
  const leftPath = onJarvis || onToday ? lastRoute : pathname || FALLBACK_LEFT_PATH;
  const leftMeta = metaForPath(leftPath);
  const LeftIcon = leftMeta.icon;

  if (pathname.startsWith("/onboarding")) return null;

  // Split-screen toggle that works from either tab. The side panel only
  // renders when the main route is NOT JARVIS (otherwise two JARVIS consoles
  // would stack). So when enabling split from the JARVIS tab, push main to
  // the last non-JARVIS route — that becomes the left pane, JARVIS occupies
  // the right pane via the side panel.
  const onSplitToggle = () => {
    if (splitOn) {
      setSplitOn(false);
      return;
    }
    if (onJarvis) {
      router.push(lastRoute);
    }
    setSplitOn(true);
  };

  return (
    <div
      role="tablist"
      aria-label="App tabs"
      className="relative flex items-center gap-1 px-3 py-1.5 border-b border-[var(--edge)] bg-[var(--canvas)]"
      style={{ minHeight: 40 }}
    >
      {todayPath && (
        <TabPill
          href={todayPath}
          active={onToday && !splitOn}
          accent={false}
          label="Today"
          icon={<CalendarDays size={13} strokeWidth={1.75} />}
          kbd="⌃3"
        />
      )}

      <TabPill
        href={leftPath}
        active={!onJarvis && !onToday && !splitOn}
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

      <TabPill
        href={JARVIS_PATH}
        active={onJarvis || splitOn}
        accent
        label="JARVIS"
        kbd="⌃2"
        icon={<KiwiIcon size={13} aria-hidden="true" />}
        dataTour="top-tab-jarvis"
      />

      <div className="ml-auto pl-2" data-tour="top-split-toggle">
        <SplitToggle on={splitOn} onClick={onSplitToggle} />
      </div>
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
          : "text-[var(--ink-muted)] hover:bg-[color-mix(in_oklch,var(--ink)_5%,transparent)] hover:text-[var(--ink)]"
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
  dataTour,
}: {
  href: string;
  active: boolean;
  accent: boolean;
  label: string;
  icon: React.ReactNode;
  kbd?: string;
  onClose?: () => void;
  dataTour?: string;
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
          ? "bg-[color-mix(in_oklch,var(--hud-cyan)_10%,var(--surface-raised))] shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--hud-cyan)_35%,transparent)]"
          : "hover:bg-[color-mix(in_oklch,var(--ink)_4%,transparent)]"
      )}
      role="tab"
      aria-selected={active}
      {...(dataTour ? { "data-tour": dataTour } : {})}
    >
      <Link
        href={href}
        className={cn(
          "flex items-center gap-2 pl-2.5 pr-2 py-1.5 font-sans text-[12px] outline-none rounded-md",
          "tracking-[-0.005em]",
          active
            ? "text-[var(--hud-cyan)] font-medium"
            : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
        )}
      >
        {accent && active && (
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
            style={{
              backgroundColor: "var(--hud-cyan)",
              boxShadow: "0 0 6px color-mix(in oklch, var(--hud-cyan) 70%, transparent)",
            }}
          />
        )}
        <span
          className="shrink-0 inline-flex items-center"
          style={
            active
              ? { color: "var(--hud-cyan)" }
              : accent
                ? { color: "var(--ink-muted)" }
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
              active ? "text-[var(--hud-cyan)]" : "text-[var(--ink-muted)]"
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
            "opacity-0 group-hover/tab:opacity-100 transition-opacity duration-100"
          )}
        >
          <X size={10} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
