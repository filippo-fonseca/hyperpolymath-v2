"use client";

import { JarvisSidePanel } from "@/components/shell/JarvisSidePanel";
import { SidePanel } from "@/components/ui/SidePanel";
import { useSplitScreen } from "@/lib/ui/useSplitScreen";
import { usePathname } from "next/navigation";

const JARVIS_PATH = "/today";

/**
 * The split-screen JARVIS console, routed through the cockpit's right slot.
 *
 * It used to be an `<aside>` nailed into the stage's flex row, which made it a
 * fourth live column the moment the Dock existed: rail + stage + split + dock
 * is exactly the arrangement SDC-1 §2.2 forbids, because on a 14-inch screen it
 * starves the stage to roughly 600px. Rendering it as a `SidePanel` means it
 * shares the one right-slot track with the Dock and obeys arbitration for free:
 * opening it slides the Dock out, closing it brings the Dock back at whatever
 * collapse state it had.
 *
 * `agent-mode-scope` rides on the console wrapper so the HUD keyframes stay
 * quarantined off page surfaces (§2.7).
 *
 * Behaviour changes in exactly one way, deliberately: below `lg` the old aside
 * was simply `hidden`, and the panel now degrades to an overlay-less sheet.
 */
export function SplitJarvisPanel() {
  const pathname = usePathname() ?? "";
  const { splitOn, setSplitOn } = useSplitScreen();

  // Suppressed on /today (that route IS the console, and two live consoles on
  // one screen is the confusion the cockpit removes) and on /onboarding, which
  // has no chrome at all. Same prefix logic the shell uses.
  const onJarvis = pathname === JARVIS_PATH || pathname.startsWith(`${JARVIS_PATH}/`);
  const onOnboarding = pathname.startsWith("/onboarding");

  return (
    <SidePanel
      open={splitOn && !onJarvis && !onOnboarding}
      onClose={() => setSplitOn(false)}
      width={420}
      title="JARVIS"
      // The console owns its own scrollback and padding; the default padded
      // scroll box would nest a second scroll container inside it.
      bodyClassName="agent-mode-scope overflow-hidden p-0"
    >
      <JarvisSidePanel />
    </SidePanel>
  );
}
