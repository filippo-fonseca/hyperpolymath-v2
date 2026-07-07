"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback } from "react";
import {
  activateWidget,
  collapseAll,
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

/**
 * StudioFocusOverlay — the DOM layer that expands one ambient widget into a
 * crisp, fully-interactive panel above the `<Canvas>`.
 *
 * SINGLE WRITER of the shared focus store (Wave-2 reconcile): it owns the
 * `useStudioIntent` subscription — `expand{targetId}` → `activateWidget`,
 * `collapse` → `collapseAll` — and every other consumer only READS
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
};

const WIDGET_IDS = new Set<string>(Object.keys(WIDGET_REGISTRY));

function isStudioWidgetId(id: string): id is StudioWidgetId {
  return WIDGET_IDS.has(id);
}

export function StudioFocusOverlay(): React.ReactElement {
  const reduced = useReducedMotion();
  const activeId = useActiveWidget();

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
            <def.Component />
          </StudioFocusPanel>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default StudioFocusOverlay;
