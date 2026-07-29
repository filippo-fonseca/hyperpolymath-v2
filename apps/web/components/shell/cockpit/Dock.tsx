"use client";

import { DockChooser } from "@/components/shell/cockpit/DockChooser";
import { DockWidgetSlot } from "@/components/shell/cockpit/DockWidgetSlot";
import { resolveDockedWidgets } from "@/components/shell/cockpit/dock-registry";
import { useRightSlot } from "@/components/shell/cockpit/right-slot-context";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

/**
 * DOCK — the right slot's default occupant (D3, D4).
 *
 * A quick-glance strip with its own purpose-built compact widgets. It is
 * deliberately NOT the LifeOS dashboard: LifeOS stays the deep view, and these
 * are two widget sets each designed for its own density.
 *
 * This component imports no widget module by name and contains no widget JSX.
 * It composes whatever `resolveDockedWidgets` hands it, and every entry carries
 * `data-dock-widget-id` so what is on screen is traceable back to the manifest.
 * Removing a line from the manifest removes the widget from the strip, with no
 * edit here.
 *
 * Collapse is persisted (`cockpit-dock-collapsed`) and the docked set is
 * persisted (`cockpit-dock-widgets`). The forced collapse below 1280px is
 * derived and never written, so a narrow window cannot overwrite the
 * preference. Nothing paints until the provider has read localStorage, so a
 * pinned-collapsed dock never flashes open on the first frame.
 */
export function Dock() {
  const { mounted, atLeastXl, dockCollapsed, setDockCollapsed, dockedIds } = useRightSlot();

  const collapsed = dockCollapsed || !atLeastXl;
  const widgets = resolveDockedWidgets(dockedIds);

  return (
    <aside
      aria-label="Dock"
      data-dock
      className={`craft-glass flex h-full min-w-0 flex-col overflow-hidden rounded-panel ${
        mounted ? "" : "invisible"
      }`}
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-1 border-b border-[var(--edge)] px-2">
        {collapsed ? null : (
          <>
            <span className="truncate px-1 text-micro font-medium text-[var(--ink-faint)]">
              Dock
            </span>
            <DockChooser />
          </>
        )}
        <button
          type="button"
          onClick={() => setDockCollapsed(!dockCollapsed)}
          // Below 1280px the dock is forced collapsed, so the toggle would be a
          // lie: it would flip a preference nothing can act on until the window
          // widens again.
          disabled={!atLeastXl}
          aria-label={collapsed ? "Expand dock" : "Collapse dock"}
          className="flex size-6 shrink-0 items-center justify-center rounded text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)] disabled:pointer-events-none disabled:opacity-40"
        >
          {collapsed ? (
            <PanelLeftClose size={14} strokeWidth={1.75} />
          ) : (
            <PanelLeftOpen size={14} strokeWidth={1.75} />
          )}
        </button>
      </header>

      {collapsed ? null : (
        <div className="sd-scroll-hover flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
          {widgets.length === 0 ? (
            <p className="px-4 py-6 text-meta text-[var(--ink-faint)]">No widgets docked.</p>
          ) : (
            widgets.map((def) => <DockWidgetSlot key={def.id} def={def} />)
          )}
        </div>
      )}
    </aside>
  );
}
