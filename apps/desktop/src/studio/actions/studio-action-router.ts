import type { StudioActionPayload } from "@/physical-extender/sse-client";

import {
  closeAll,
  closeWidget,
  closeWidgetsByKind,
  summonWidget,
} from "../state/widget-windows";
import { WIDGET_CATALOG, type WidgetKind } from "../windows/catalog";

function isWidgetKind(value: string): value is WidgetKind {
  return value in WIDGET_CATALOG;
}

export function routeStudioAction(payload: StudioActionPayload): void {
  if (payload.action === "open") {
    if (!isWidgetKind(payload.kind)) return;
    const entry = WIDGET_CATALOG[payload.kind];
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
