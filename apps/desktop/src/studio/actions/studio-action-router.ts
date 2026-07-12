import type { StudioActionPayload } from "@/physical-extender/sse-client";

import {
  closeAll,
  closeWidget,
  closeWidgetsByKind,
  findWidgetByKind,
  summonWidget,
  updateWidgetProps,
} from "../state/widget-windows";
import { WIDGET_CATALOG, type WidgetKind } from "../windows/catalog";

function isWidgetKind(value: string): value is WidgetKind {
  return value in WIDGET_CATALOG;
}

export function routeStudioAction(payload: StudioActionPayload): void {
  if (payload.action === "open") {
    if (!isWidgetKind(payload.kind)) return;
    const entry = WIDGET_CATALOG[payload.kind];
    // A singleton widget that's already open won't take new props from
    // summonWidget (it just focuses the existing instance). When the open
    // action carries focus props (e.g. a whatsapp_focus_chat request naming a
    // chat to jump to), push them onto the existing instance so an already-open
    // widget still navigates. summonWidget then focuses/restores it.
    if (entry.singleton && payload.props) {
      const existing = findWidgetByKind(payload.kind);
      if (existing) updateWidgetProps(existing.id, payload.props);
    }
    summonWidget(payload.kind, payload.props, undefined, {
      defaultSize: entry.defaultSize,
      singleton: entry.singleton,
    });
    return;
  }

  if (payload.target === "id") {
    closeWidget(payload.kind);
  } else if (payload.kind === "all") {
    closeAll();
  } else if (isWidgetKind(payload.kind)) {
    closeWidgetsByKind(payload.kind);
  }
}
