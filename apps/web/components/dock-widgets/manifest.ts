import type { DockWidgetDef } from "@/components/shell/cockpit/dock-registry";
import { habitsWidget } from "./habits";
import { homeDevicesWidget } from "./home-devices";
import { nextEventWidget } from "./next-event";
import { studyReviewWidget } from "./study-review";
import { todayCountsWidget } from "./today-counts";

/**
 * Every dock widget, in one list.
 *
 * This is the ONLY file a new widget touches besides its own. Shipping one is a
 * new sibling file here plus an appended line below, and zero edits to anything
 * under `components/shell/`. Because the entries are append-only one-liners,
 * two units adding a widget in parallel merge without inspection.
 *
 * Order fields are spaced by ten so a widget can slot between two existing ones
 * without renumbering the rest.
 */
export const DOCK_WIDGETS: DockWidgetDef<unknown>[] = [
  todayCountsWidget,
  nextEventWidget,
  studyReviewWidget,
  homeDevicesWidget,
  habitsWidget,
];
