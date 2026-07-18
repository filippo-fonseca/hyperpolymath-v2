import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import {
  BrowserIcon,
  CameraIcon,
  ClockIcon,
  JarvisIcon,
  NewsIcon,
  PageIcon,
  SettingsIcon,
  WeatherIcon,
  WhatsappIcon,
} from "@hyperpolymath/ui-icons";

export type WidgetKind =
  | "browser"
  | "whatsapp"
  | "weather"
  | "news"
  | "card"
  | "clock"
  | "camera"
  | "settings"
  | "orb";

export interface WidgetContentProps {
  id: string;
  props: Record<string, unknown>;
}

export interface WidgetCatalogEntry {
  label: string;
  /**
   * The widget's motif, from the shared dimensional-icon family (sealed D3 —
   * desktop's nouns, authored on the same recipe as the web's, never forked).
   *
   * These are 80x80 modelled SVGs, not line glyphs: they read from 24px and are
   * meant to be seen at 40-48px. Do NOT render one below 16px — the body
   * gradient and drop shadow collapse into a smudge, which is exactly the
   * failure the lucide glyphs they replaced did not have. Give them room.
   */
  icon: ComponentType<{ size?: number; className?: string }>;
  component: LazyExoticComponent<ComponentType<WidgetContentProps>>;
  defaultSize: { w: number; h: number };
  singleton?: boolean;
  permanent?: boolean;
}

export const WIDGET_CATALOG: Record<WidgetKind, WidgetCatalogEntry> = {
  browser: {
    label: "Browser",
    icon: BrowserIcon,
    component: lazy(() => import("../widgets/BrowserWidget")),
    defaultSize: { w: 0.42, h: 0.5 },
  },
  whatsapp: {
    label: "WhatsApp",
    icon: WhatsappIcon,
    component: lazy(() => import("../widgets/WhatsAppWidget")),
    defaultSize: { w: 0.3, h: 0.46 },
    singleton: true,
  },
  weather: {
    label: "Weather",
    icon: WeatherIcon,
    component: lazy(() => import("../widgets/WeatherWidget")),
    defaultSize: { w: 0.28, h: 0.31 },
    singleton: true,
  },
  news: {
    label: "News",
    icon: NewsIcon,
    component: lazy(() => import("../widgets/NewsWidget")),
    defaultSize: { w: 0.34, h: 0.46 },
    singleton: true,
  },
  card: {
    label: "Card",
    icon: PageIcon,
    component: lazy(() => import("../widgets/CardWidget")),
    defaultSize: { w: 0.27, h: 0.25 },
  },
  clock: {
    label: "Clock",
    icon: ClockIcon,
    component: lazy(() => import("../widgets/ClockWidget")),
    defaultSize: { w: 0.26, h: 0.2 },
    singleton: true,
  },
  camera: {
    label: "Camera",
    icon: CameraIcon,
    component: lazy(() => import("../widgets/CameraWidget")),
    defaultSize: { w: 0.3, h: 0.34 },
    singleton: true,
  },
  settings: {
    label: "Settings",
    icon: SettingsIcon,
    component: lazy(() => import("../widgets/SettingsWidget")),
    defaultSize: { w: 0.3, h: 0.42 },
    singleton: true,
  },
  orb: {
    label: "JARVIS Orb",
    icon: JarvisIcon,
    component: lazy(() => import("../widgets/OrbWidget")),
    defaultSize: { w: 0.25, h: 0.4 },
    singleton: true,
    permanent: true,
  },
};

export function catalogEntries(): Array<[WidgetKind, WidgetCatalogEntry]> {
  return Object.entries(WIDGET_CATALOG) as Array<
    [WidgetKind, WidgetCatalogEntry]
  >;
}
