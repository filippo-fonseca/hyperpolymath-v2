"use client";

import type { DockWidgetDef } from "@/components/shell/cockpit/dock-registry";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { Component, type ReactNode, useState } from "react";

/**
 * One widget's box in the strip.
 *
 * The Dock knows nothing about what is inside here. The leaf calls the widget's
 * own `useData()` and renders its own `Compact`, which keeps hooks legal (each
 * widget is its own component instance) and means an undocked widget never
 * mounts, so its query and its subscription never run.
 *
 * The error boundary is per widget on purpose: a widget whose hook throws (the
 * Govee API being down, say) degrades to its own error line while the rest of
 * the strip keeps rendering.
 */
export function DockWidgetSlot({ def }: { def: DockWidgetDef<unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = Boolean(def.Expanded);

  return (
    <section
      data-dock-widget-id={def.id}
      className="border-b border-[var(--edge)] px-2 py-3 last:border-b-0"
    >
      <header className="flex h-6 items-center justify-between gap-2 px-2">
        <h3 className="truncate text-micro font-medium text-[var(--ink-faint)]">{def.title}</h3>
        {canExpand ? (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${def.title}` : `Expand ${def.title}`}
            className="flex size-5 shrink-0 items-center justify-center rounded text-[var(--ink-faint)] transition-colors duration-[160ms] ease-out hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          >
            <ChevronDown
              size={12}
              strokeWidth={2}
              className={cn(
                "transition-transform duration-[160ms] ease-out",
                expanded && "rotate-180"
              )}
            />
          </button>
        ) : null}
      </header>

      <div className="mt-2">
        <WidgetErrorBoundary title={def.title}>
          <WidgetLeaf def={def} expanded={expanded} />
        </WidgetErrorBoundary>
      </div>
    </section>
  );
}

function WidgetLeaf({
  def,
  expanded,
}: {
  def: DockWidgetDef<unknown>;
  expanded: boolean;
}) {
  const data = def.useData();
  const Expanded = def.Expanded;
  if (expanded && Expanded) return <Expanded data={data} />;
  return <def.Compact data={data} />;
}

class WidgetErrorBoundary extends Component<
  { title: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="px-2 text-meta text-[var(--ink-faint)]">
          {this.props.title} is unavailable right now.
        </p>
      );
    }
    return this.props.children;
  }
}
