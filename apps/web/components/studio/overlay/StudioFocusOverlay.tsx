"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Variants } from "motion/react";
import { useCallback, useState } from "react";
import {
  activateWidget,
  collapseAll,
  getActiveWidgets,
  pageActiveWidget,
  useActiveWidget,
} from "@/lib/studio/state/active-widget";
import type { StudioWidgetId } from "@/components/studio/data/useStudioData";
import { useStudioIntent } from "@/lib/studio/input/react";
import { StudioFocusPanel } from "./StudioFocusPanel";
import { TasksFocus } from "./widgets/TasksFocus";
import { CapturesFocus } from "./widgets/CapturesFocus";
import { AgendaFocus } from "./widgets/AgendaFocus";
import { HabitsFocus } from "./widgets/HabitsFocus";
import { JournalFocus } from "./widgets/JournalFocus";
import { ProjectsFocus } from "./widgets/ProjectsFocus";
import { AreasFocus } from "./widgets/AreasFocus";
import { PeopleFocus } from "./widgets/PeopleFocus";

/**
 * StudioFocusOverlay — the DOM layer that expands one ambient widget into a
 * crisp, fully-interactive panel above the `<Canvas>`.
 *
 * SINGLE WRITER of the shared focus store (Wave-2/3 reconcile): it owns the
 * `useStudioIntent` subscription — `expand{targetId}` → `activateWidget`,
 * `collapse` → `collapseAll`, `swipeLeft`/`swipeRight` → `pageActiveWidget`
 * (Wave-3 swipe-paging consumption) — and every other consumer only READS
 * `useActiveWidget()` / `useActiveWidgets()`. It also renders off that store, so
 * an `expand` while a panel is open swaps the focused widget in place.
 *
 * The scrim (dim + minimal blur) lives here (deviation 4): it exists only while
 * a widget is focused, so the demand-frame Canvas pays nothing when idle. The
 * scrim catches click-outside (→ collapse); the panel stops propagation so
 * interior clicks never reach the window-level mouse driver.
 */

interface WidgetDef {
  title: string;
  Component: () => React.ReactElement;
}

const WIDGET_REGISTRY: Record<StudioWidgetId, WidgetDef> = {
  tasks: { title: "Tasks", Component: TasksFocus },
  captures: { title: "Captures", Component: CapturesFocus },
  agenda: { title: "Agenda", Component: AgendaFocus },
  habits: { title: "Habits", Component: HabitsFocus },
  journal: { title: "Journal", Component: JournalFocus },
  projects: { title: "Projects", Component: ProjectsFocus },
  areas: { title: "Areas", Component: AreasFocus },
  people: { title: "People", Component: PeopleFocus },
};

const WIDGET_IDS = new Set<string>(Object.keys(WIDGET_REGISTRY));

function isStudioWidgetId(id: string): id is StudioWidgetId {
  return WIDGET_IDS.has(id);
}

/**
 * Direction-aware body transition for swipe-paging. On `next` (swipeRight) the
 * incoming body enters from the right (+48px) and the outgoing exits left; on
 * `prev` it mirrors. A crisp 48px slide + cross-fade at 0.18s ease-out, matching
 * the scrim's timing. Reduced motion collapses to an instant opacity swap
 * (duration 0), same convention as the panel + scrim.
 */
function pageVariants(reduced: boolean): Variants {
  if (reduced) {
    return {
      enter: { opacity: 0 },
      center: { opacity: 1, transition: { duration: 0 } },
      exit: { opacity: 0, transition: { duration: 0 } },
    };
  }
  return {
    enter: (dir: 1 | -1) => ({ x: dir * 48, opacity: 0 }),
    center: {
      x: 0,
      opacity: 1,
      transition: { duration: 0.18, ease: "easeOut" },
    },
    exit: (dir: 1 | -1) => ({
      x: dir * -48,
      opacity: 0,
      transition: { duration: 0.18, ease: "easeOut" },
    }),
  };
}

export function StudioFocusOverlay(): React.ReactElement {
  const reduced = useReducedMotion();
  const activeId = useActiveWidget();
  // Direction of the most recent page, set in the same event-handler tick as
  // the store write so the keyed body always animates the causing direction.
  const [pageDir, setPageDir] = useState<1 | -1>(1);

  // The single writer: translate discrete input intents into store writes.
  useStudioIntent(
    useCallback((intent) => {
      switch (intent.type) {
        case "expand":
          if (isStudioWidgetId(intent.targetId)) activateWidget(intent.targetId);
          break;
        case "collapse":
          collapseAll();
          break;
        case "swipeRight":
          // Read the store getter, never the memoized render value (stale).
          if (getActiveWidgets().length > 0) {
            setPageDir(1);
            pageActiveWidget("next");
          }
          break;
        case "swipeLeft":
          if (getActiveWidgets().length > 0) {
            setPageDir(-1);
            pageActiveWidget("prev");
          }
          break;
        default:
          break;
      }
    }, []),
  );

  const def = activeId ? WIDGET_REGISTRY[activeId] : null;

  return (
    <AnimatePresence>
      {activeId !== null && def !== null ? (
        <motion.div
          key="studio-focus-overlay"
          data-testid="studio-focus-overlay"
          role="presentation"
          onClick={() => collapseAll()}
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-6 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.18 }}
        >
          <StudioFocusPanel title={def.title} onClose={() => collapseAll()}>
            {/* Keyed body: swipe-paging slides the content region only, leaving
                the panel chrome (frame/header/close) mounted and un-animated.
                initial={false} so the first open keeps the panel's own spring
                entrance with no extra body animation. */}
            <AnimatePresence mode="popLayout" initial={false} custom={pageDir}>
              <motion.div
                key={activeId}
                custom={pageDir}
                variants={pageVariants(reduced ?? false)}
                initial="enter"
                animate="center"
                exit="exit"
              >
                <def.Component />
              </motion.div>
            </AnimatePresence>
          </StudioFocusPanel>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default StudioFocusOverlay;
