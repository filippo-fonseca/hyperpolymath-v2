"use client";

import { AmbientGlow } from "@/components/ui/ambient";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { useSplitScreen } from "@/lib/ui/useSplitScreen";
import { usePathname } from "next/navigation";
import { JarvisSidePanel } from "./JarvisSidePanel";
import { ProductTour } from "./ProductTour";
import { Rail } from "./cockpit/Rail";
import { RightSlot } from "./cockpit/RightSlot";
import { Stage } from "./cockpit/Stage";

interface Props {
  userId: string;
  activeAreas: SidebarArea[];
  allAreas: SidebarArea[];
  graduationYear?: number | null;
  profile: {
    displayName: string | null;
    email: string;
    avatarUrl: string | null;
    oauthAvatarUrl: string | null;
  };
  children: React.ReactNode;
}

const JARVIS_PATH = "/today";

/**
 * AppShell — the control-center cockpit (D3, SDC-1 §2.1).
 *
 * Three zones, one CSS grid, one row:
 *
 *   ┌────────┐ ┌──────────────────────────┐ ┌───────────────┐
 *   │  RAIL  │ │          STAGE           │ │  RIGHT SLOT   │
 *   │ nav +  │ │   active feature route   │ │ Dock (default)│
 *   │  tree  │ ├──────────────────────────┤ │      OR       │
 *   │        │ │  🥝 ask kiwi…          ⏎ │ │  SidePanel    │
 *   └────────┘ └──────────────────────────┘ └───────────────┘
 *
 * The tool frame stays put; only the stage swaps on navigation. The rail track
 * is `auto` and sizes itself from the Sidebar's own width transition. The stage
 * is `minmax(0,1fr)`, which is what lets it genuinely reflow (rather than be
 * covered) when the right track widens. The right track is the single animated
 * value in the layout, and it is the one sanctioned width animation in the app
 * because it runs on `grid-template-columns` rather than on the width of a flex
 * child.
 *
 * `gridTemplateColumns` is set inline rather than as an arbitrary Tailwind
 * class deliberately: it is the animated property, and an arbitrary utility
 * used in exactly one file is exactly the case Tailwind 4's scan gap can miss.
 *
 * `isolate` on the root is load-bearing. It scopes AmbientGlow's fixed,
 * negative-z layer so the glow paints above the canvas fill and below the rail
 * and stage content.
 */
export function AppShell({
  userId,
  activeAreas,
  allAreas,
  graduationYear,
  profile,
  children,
}: Props) {
  const pathname = usePathname() ?? "";
  const { splitOn } = useSplitScreen();

  const onJarvis = pathname === JARVIS_PATH || pathname.startsWith(JARVIS_PATH + "/");
  const onOnboarding = pathname.startsWith("/onboarding");
  const onWikiHome = pathname === "/wiki";
  const showPanel = splitOn && !onJarvis && !onOnboarding;

  return (
    <div
      className="isolate grid h-screen w-screen overflow-hidden bg-[var(--canvas)] text-[var(--ink)]"
      style={{
        gridTemplateColumns: "auto minmax(0,1fr) 0px",
        gridTemplateRows: "minmax(0,1fr)",
      }}
    >
      {/* Whisper-level ambient glow behind every route. Fixed and negative-z,
          so it takes no grid track. With the Life OS hero plate gone this is
          the only glow left in the app, and it must stay barely-there. */}
      <AmbientGlow intensity="whisper" className="opacity-50" />

      {/* Product tour — mounts once globally; runs only when hp_tour_pending
          is set in localStorage (written by onboarding-flow before redirect)
          and hp_tour_v1_done is NOT set. Renders a fixed overlay or nothing,
          so it takes no grid track either. */}
      <ProductTour />

      <Rail
        userId={userId}
        activeAreas={activeAreas}
        allAreas={allAreas}
        graduationYear={graduationYear}
        profile={profile}
      />

      <Stage
        userId={userId}
        onWikiHome={onWikiHome}
        sidePane={
          showPanel ? (
            <aside
              aria-label="JARVIS side panel"
              className="agent-mode-scope hidden w-[30%] min-w-[360px] max-w-[520px] flex-col overflow-hidden border-l border-[var(--edge)] bg-[var(--canvas)] lg:flex"
            >
              <JarvisSidePanel />
            </aside>
          ) : null
        }
      >
        {children}
      </Stage>

      <RightSlot />
    </div>
  );
}
