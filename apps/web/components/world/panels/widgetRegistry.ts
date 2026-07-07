// The Conductor populates entries at each wave boundary as widget components land — like WorldScene mounts. Widget units NEVER edit this file.
/**
 * widgetRegistry.ts — W-02 · The Studiolo · Phase 3 (The Bottega) · widget registry
 *
 * The single place the bench roster grows (PHASE-3-PLAN §3.7). Each `WidgetId`
 * maps to a `WidgetSpec` — its title and its self-contained React component,
 * which renders its own `<WorldPanel>` with its content. The rig (W-06) reads
 * this registry, solves the arc (`widgetLayout.ts`), and renders each visible
 * widget's component with `{ slot, focused, lod }`.
 *
 * ── POPULATION SEAM (how the Conductor grows the roster) ────────────────────
 * This file ships with an EMPTY map on purpose: at Wave W1 close NO widget
 * component exists yet (TasksWidget, CapturesWidget, … are Wave W2/W3 units), and
 * a widget unit MUST NOT edit this file (that would reintroduce the cross-file
 * race Wave W1 was designed to avoid). Instead — exactly like `WorldScene.tsx`'s
 * mount list — the CONDUCTOR edits the `WIDGET_REGISTRY` object literal at each
 * wave boundary as components land: add the component's `import`, then add one
 * `id: { id, title, component }` entry. Chosen over a runtime `registerWidget()`
 * seam precisely because it mirrors the static WorldScene-mount idiom the world
 * already lives by (declarative, greppable, no import-order/init-timing hazard).
 *
 * The map is typed `Partial<Record<WidgetId, WidgetSpec>>` so it is valid while
 * partially populated; consumers read through `getWidgetSpec` / `listWidgets`
 * (which tolerate absent entries) rather than indexing blind. Once every widget
 * has landed the map is effectively a full `Record<WidgetId, WidgetSpec>`.
 */
import type { ComponentType } from "react";
import type { BenchSlot, WidgetId } from "./widgetTypes";

/** Panel level-of-detail (PHASE-3-PLAN §7.2): full uikit content vs. frame + SDF title. */
export type WidgetLod = "full" | "placard";

/**
 * What the rig hands each widget component. A widget renders its own
 * `<WorldPanel>` from these. Drag-handle wiring (W-03's `DragHandleProps`) is
 * threaded by the rig separately and stays owned by W-03/W-07 — it is not part of
 * this Wave-W1 shared shape, so this file has zero dependency on unbuilt units.
 */
export interface WidgetComponentProps {
  slot: BenchSlot;
  focused: boolean;
  lod: WidgetLod;
}

export type WidgetComponent = ComponentType<WidgetComponentProps>;

/** One roster entry: the id, its header caption, and its self-contained component. */
export interface WidgetSpec {
  id: WidgetId;
  title: string;
  component: WidgetComponent;
}

/**
 * The bench roster. EMPTY at Wave W1 close — the Conductor adds entries here as
 * widget components land (see the population seam above). Example of the shape a
 * populated entry takes (do NOT uncomment; the component does not exist yet):
 *
 *   import { TasksWidget } from "./TasksWidget";
 *   export const WIDGET_REGISTRY: Partial<Record<WidgetId, WidgetSpec>> = {
 *     tasks: { id: "tasks", title: "Tasks", component: TasksWidget },
 *   };
 */
export const WIDGET_REGISTRY: Partial<Record<WidgetId, WidgetSpec>> = {};

/** The spec for `id`, or `undefined` if that widget hasn't landed on the bench yet. */
export function getWidgetSpec(id: WidgetId): WidgetSpec | undefined {
  return WIDGET_REGISTRY[id];
}

/** Whether `id` currently has a live registry entry. */
export function isWidgetRegistered(id: WidgetId): boolean {
  return WIDGET_REGISTRY[id] !== undefined;
}

/** Every registered spec (insertion order of the literal). Absent widgets are skipped. */
export function listWidgets(): WidgetSpec[] {
  const out: WidgetSpec[] = [];
  for (const spec of Object.values(WIDGET_REGISTRY)) {
    if (spec !== undefined) out.push(spec);
  }
  return out;
}
