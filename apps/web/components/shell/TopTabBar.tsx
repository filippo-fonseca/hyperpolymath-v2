"use client";

import { NavArrows } from "./NavArrows";
import { useTodayDailyPage } from "@/lib/pages/useTodayDailyPage";
import { useSplitScreen } from "@/lib/ui/useSplitScreen";
import { cn } from "@/lib/utils";
import { Columns2, Plus, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/ui/sfx";
import { JarvisUnreadBadge } from "@/components/jarvis/JarvisUnreadBadge";

const JARVIS_PATH = "/today";
const FALLBACK_LEFT_PATH = "/lifeos";
const STORAGE_KEY = "top-tab-last-route";
// Mirror of today's daily-page route, written here so GlobalHotkeys can route
// Ctrl+3 to it without re-querying.
const TODAY_ROUTE_KEY = "top-tab-today-route";

const ROUTE_META: Record<string, { label: string }> = {
  "/lifeos": { label: "LifeOS" },
  "/tasks": { label: "Tasks" },
  "/habits": { label: "Habits" },
  "/training": { label: "Training" },
  "/nutrition": { label: "Nutrition" },
  "/captures": { label: "Captures" },
  "/calendar": { label: "Calendar" },
  "/graph": { label: "Graph" },
  "/insights": { label: "Insights" },
  "/settings": { label: "Settings" },
  "/journaling": { label: "Journal" },
  "/areas": { label: "Areas" },
  "/people": { label: "People" },
};

function metaForPath(pathname: string): { label: string } {
  if (ROUTE_META[pathname]) return ROUTE_META[pathname];
  const segs = pathname.split("/").filter(Boolean);
  while (segs.length > 0) {
    const candidate = "/" + segs.join("/");
    if (ROUTE_META[candidate]) return ROUTE_META[candidate];
    segs.pop();
  }
  const first = pathname.split("/").filter(Boolean)[0] ?? "Page";
  return { label: first.charAt(0).toUpperCase() + first.slice(1) };
}

/**
 * TopTabBar — the full-width segmented tab bar (UI-CONTRACT §3 + §11).
 *
 * Their pattern, exactly: the tabs divide the whole bar between them rather
 * than huddling left. Each is a flex-1 pill (min 220px, max 480px) with a
 * centred label; the active one fills with the neutral `--sd-selected`
 * backplate, the rest sit transparent on the canvas. Selection is carried by
 * the fill alone — no accent tint, no icon, no glow dot (R4). The close ✕
 * lives inside the pill at left and reveals on hover; the ^N hint sits right.
 *
 * Split-screen affordance: a quiet vertical-split glyph after the tabs. When
 * split is on, both routes render simultaneously (70% / 30%) so switching
 * tabs swaps the left pane only. The "+" cell opens the command palette.
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

  // Soft "pop" when the active feature tab actually changes — not on drill-in
  // navigations within a feature (e.g. /tasks → /tasks/123) or first mount.
  const tabKey = onJarvis ? "jarvis" : onToday ? "today" : metaForPath(pathname).label;
  const prevTabKey = useRef<string | null>(null);
  useEffect(() => {
    if (prevTabKey.current !== null && prevTabKey.current !== tabKey) {
      sfx.play("viewToggle");
    }
    prevTabKey.current = tabKey;
  }, [tabKey]);

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

  // The "+" cell is their new-tab affordance; here it opens the command
  // palette, which is how a new surface actually gets reached in this app.
  const onNewTab = () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      })
    );
  };

  return (
    <div
      role="tablist"
      aria-label="App tabs"
      className="relative flex h-11 w-full items-center gap-1.5 px-2 mb-1"
    >
      <NavArrows />

      {/* The tabs divide the bar between them (§3). */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <TabPill
          href={leftPath}
          active={!onJarvis && !onToday && !splitOn}
          label={leftMeta.label}
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
          label="JARVIS"
          kbd="⌃2"
          dataTour="top-tab-jarvis"
          badge={<JarvisUnreadBadge />}
        />

        {todayPath && (
          <TabPill
            href={todayPath}
            active={onToday && !splitOn}
            label="Today"
            kbd="⌃3"
          />
        )}
      </div>

      <button
        type="button"
        onClick={onNewTab}
        aria-label="Open command palette"
        title="Open command palette (⌘⇧K)"
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-md p-1.5",
          "text-[var(--sd-ink-faint)] transition-colors duration-[80ms] ease-out",
          "hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]"
        )}
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>

      <div className="shrink-0" data-tour="top-split-toggle">
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
        "inline-flex h-6 w-6 items-center justify-center rounded-md",
        "transition-colors duration-[50ms] ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
        on
          ? "bg-[color-mix(in_oklch,var(--sd-accent)_14%,transparent)] text-[var(--sd-accent)]"
          : "text-[var(--sd-ink-faint)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]"
      )}
    >
      <Columns2 size={12} strokeWidth={1.75} />
    </button>
  );
}

/**
 * One segment of the bar: a flex-1 pill with a centred label, a hover-revealed
 * close ✕ inside at left and the shortcut hint inside at right. Both affordances
 * are absolutely placed so they never shift the label off centre.
 */
function TabPill({
  href,
  active,
  label,
  kbd,
  onClose,
  dataTour,
  badge,
}: {
  href: string;
  active: boolean;
  label: string;
  kbd?: string;
  onClose?: () => void;
  dataTour?: string;
  /** Optional trailing indicator (e.g. JARVIS unread-message counter). */
  badge?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "group/tab relative flex h-9 min-w-[220px] max-w-[480px] flex-1 items-center rounded-full",
        "transition-colors duration-[80ms] ease-out",
        active
          ? "bg-[var(--sd-selected)]"
          : "bg-transparent hover:bg-[color-mix(in_oklch,var(--sd-hover)_40%,transparent)]"
      )}
      role="tab"
      aria-selected={active}
      {...(dataTour ? { "data-tour": dataTour } : {})}
    >
      <Link
        href={href}
        className={cn(
          "flex h-full w-full items-center justify-center gap-1.5 rounded-full px-9",
          "font-sans text-[14px] font-medium tracking-[-0.005em] outline-none",
          "transition-colors duration-[80ms] ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sd-accent)]",
          active
            ? "text-[var(--sd-ink)]"
            : "text-[var(--sd-ink-faint)] hover:text-[var(--sd-ink)]"
        )}
      >
        <span className="truncate">{label}</span>
        {badge}
      </Link>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${label} tab`}
          className={cn(
            "absolute left-2 inline-flex items-center justify-center rounded p-1",
            "text-[var(--sd-ink-faint)] hover:bg-[var(--sd-hover)] hover:text-[var(--sd-ink)]",
            "opacity-0 group-hover/tab:opacity-100 transition-opacity duration-[80ms] ease-out"
          )}
        >
          <X size={14} strokeWidth={2} />
        </button>
      )}

      {kbd && (
        <span
          className="pointer-events-none absolute right-3 hidden font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--sd-ink-faint)] md:inline"
          aria-hidden
        >
          {kbd}
        </span>
      )}
    </div>
  );
}
