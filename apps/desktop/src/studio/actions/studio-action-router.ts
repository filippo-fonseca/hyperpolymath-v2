import type { StudioActionPayload } from "@/physical-extender/sse-client";

import { noteBrowserUrl } from "./browser-router";
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
    // A studio-action browser open counts against this turn's dedupe set so a
    // sibling open_url tool-call for the same page doesn't open it a second
    // time. The payload carries no turnId, so this lands in the no-turn bucket
    // which the open_url path also consults.
    if (payload.kind === "browser") {
      const url = (payload.props as { url?: unknown } | undefined)?.url;
      if (typeof url === "string" && url.length > 0) noteBrowserUrl(url);
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
