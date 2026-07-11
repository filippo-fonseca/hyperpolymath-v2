import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { CloudSun, Globe2, MessageCircle, Newspaper } from "lucide-react";

export type WidgetKind = "browser" | "whatsapp" | "weather" | "news";

export interface WidgetContentProps {
  id: string;
  props: Record<string, unknown>;
}

export interface WidgetCatalogEntry {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  component: LazyExoticComponent<ComponentType<WidgetContentProps>>;
  defaultSize: { w: number; h: number };
  singleton?: boolean;
}

export const WIDGET_CATALOG: Record<WidgetKind, WidgetCatalogEntry> = {
  browser: {
    label: "Browser",
    icon: Globe2,
    component: lazy(() => import("../widgets/BrowserWidget")),
    defaultSize: { w: 0.42, h: 0.5 },
  },
  whatsapp: {
    label: "WhatsApp",
    icon: MessageCircle,
    component: lazy(() => import("../widgets/WhatsAppWidget")),
    defaultSize: { w: 0.3, h: 0.46 },
    singleton: true,
  },
  weather: {
    label: "Weather",
    icon: CloudSun,
    component: lazy(() => import("../widgets/WeatherWidget")),
    defaultSize: { w: 0.28, h: 0.31 },
    singleton: true,
  },
  news: {
    label: "News",
    icon: Newspaper,
    component: lazy(() => import("../widgets/NewsWidget")),
    defaultSize: { w: 0.34, h: 0.46 },
    singleton: true,
  },
};

export function catalogEntries(): Array<[WidgetKind, WidgetCatalogEntry]> {
  return Object.entries(WIDGET_CATALOG) as Array<
    [WidgetKind, WidgetCatalogEntry]
  >;
}
