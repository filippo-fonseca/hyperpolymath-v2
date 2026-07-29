"use client";

import { AmbientGlow } from "@/components/ui/ambient";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { ProductTour } from "./ProductTour";
import { Rail } from "./cockpit/Rail";
import { RightSlot } from "./cockpit/RightSlot";
import { SplitJarvisPanel } from "./cockpit/SplitJarvisPanel";
import { Stage } from "./cockpit/Stage";
import {
  RightSlotProvider,
  computeRightSlotWidth,
  useRightSlot,
} from "./cockpit/right-slot-context";

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
export function AppShell(props: Props) {
  return (
    <RightSlotProvider>
      <CockpitGrid {...props} />
    </RightSlotProvider>
  );
}

/**
 * The grid itself, one level below the provider so it can read the arbitrated
 * track width. It re-renders when a panel opens or the Dock collapses; the
 * route subtree does not, because `children` arrives as a prop from `AppShell`
 * (which does not re-render) and React bails out on an identical element.
 */
function CockpitGrid({ userId, activeAreas, allAreas, graduationYear, profile, children }: Props) {
  const pathname = usePathname() ?? "";
  const reduceMotion = useReducedMotion();
  const slot = useRightSlot();

  const onWikiHome = pathname === "/wiki";

  const rightWidth = computeRightSlotWidth({
    panel: slot.panelChrome,
    // The Dock is the slot's default occupant, and it is absent below 1024px.
    dockAvailable: slot.atLeastLg,
    dockCollapsed: slot.dockCollapsed,
    atLeastXl: slot.atLeastXl,
  });

  return (
    <div
      className="craft-backdrop isolate grid h-screen w-screen gap-2.5 overflow-hidden p-2.5 text-[var(--ink)]"
      style={{
        gridTemplateColumns: `auto minmax(0,1fr) ${rightWidth}`,
        gridTemplateRows: "minmax(0,1fr)",
        // The one sanctioned width animation in the app. It runs on the grid
        // template rather than on an element's width, so the stage genuinely
        // reflows mid-transition instead of being slid over.
        transition: reduceMotion ? undefined : "grid-template-columns 260ms var(--ease-collapse)",
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

      <Stage userId={userId} onWikiHome={onWikiHome}>
        {children}
      </Stage>

      {/* Renders no DOM in the grid: at `lg` and above it registers into the
          right slot, and below `lg` it portals a sheet. Either way it takes no
          track of its own, which is the whole point of the shared slot. */}
      <SplitJarvisPanel />

      <RightSlot />
    </div>
  );
}
