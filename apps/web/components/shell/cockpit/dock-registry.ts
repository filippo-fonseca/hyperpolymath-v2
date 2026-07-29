import { DOCK_WIDGETS } from "@/components/dock-widgets/manifest";
import type { ComponentType } from "react";

/**
 * The Dock is a registry, not a hardcoded strip (D11).
 *
 * A widget declares its id, its title, how it renders compact, optionally how
 * it renders expanded, and its own data hook. The Dock composes whatever is
 * registered and knows nothing else about any of it: the widget's fetching, its
 * realtime subscription and its error state stay the widget's own problem,
 * because the Dock calls `useData()` inside that widget's own boundary.
 *
 * Shipping a widget is therefore **one new file under `components/dock-widgets/`
 * plus one appended line in the manifest, and zero edits to any shell file.**
 * That is the whole point: a dock that hardcodes its contents forces every
 * future widget to re-open the shell, which is exactly the coupling the cockpit
 * restructure exists to remove. The habits widget and the queued XP system are
 * the next two consumers.
 *
 * Treat `DockWidgetDef` as published API. Additive changes only.
 */
export type DockWidgetDef<TData = unknown> = {
  /** Stable kebab-case, forever: this is the persistence key. */
  id: string;
  /** Sentence case, never uppercase (SDC-1 §2.4). */
  title: string;
  /** Shown to a user who has never chosen. */
  defaultDocked?: boolean;
  /** Tie-break among docked widgets, lower first. Defaults to 100. */
  order?: number;
  /** The widget's OWN hook. The Dock never fetches for it. */
  useData: () => TData;
  /** Required; renders in the strip. */
  Compact: ComponentType<{ data: TData }>;
  /** Optional; renders in a per-widget disclosure inside the strip. */
  Expanded?: ComponentType<{ data: TData }>;
  /**
   * jul-29 craft restyle — optional identity (additive per the API note).
   * `icon` renders on a small tinted plate in the card header; `tint` is a
   * craft `tint-*` class applied to the widget's card so descendants can
   * consume `var(--tint-…)`.
   */
  icon?: ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  tint?: string;
};

/**
 * Identity function. Its only job is type erasure at the boundary: a widget
 * gets full inference over its own `TData`, and the manifest gets a
 * homogeneous array the Dock can iterate.
 */
export function defineDockWidget<TData>(def: DockWidgetDef<TData>): DockWidgetDef<unknown> {
  return def as DockWidgetDef<unknown>;
}

/**
 * Every registered widget, ordered.
 *
 * `registry → manifest → widget → registry` is a static import cycle, and it is
 * safe because both exports here are hoisted declarations: they exist at module
 * instantiation, before any widget module body runs.
 */
export function getDockWidgets(): DockWidgetDef<unknown>[] {
  return [...DOCK_WIDGETS].sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title)
  );
}

/**
 * Which widgets are docked, given the persisted choice. `null` means the user
 * has never chosen, so each widget's own `defaultDocked` decides. A persisted
 * id that no longer resolves to a registered widget is dropped rather than
 * rendered as a hole.
 */
export function resolveDockedWidgets(persisted: string[] | null): DockWidgetDef<unknown>[] {
  const all = getDockWidgets();
  if (!persisted) return all.filter((def) => def.defaultDocked);

  const byId = new Map(all.map((def) => [def.id, def]));
  const docked: DockWidgetDef<unknown>[] = [];
  for (const id of persisted) {
    const def = byId.get(id);
    if (def) docked.push(def);
  }
  return docked;
}
