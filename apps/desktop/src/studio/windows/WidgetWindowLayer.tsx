import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { Drawer } from "../drawer/Drawer";
import { HandTrackingLayer } from "../input/HandTrackingLayer";
import {
  HUD_EASE_OUT_QUART,
  SD_ACCENT,
  SD_INK,
  SD_RADIUS,
  SD_SURFACES,
  STUDIO_MONO,
} from "../tokens";
import {
  getWidgetWindows,
  rehydrateWidgetWindows,
  summonWidget,
  useWidgetWindows,
} from "../state/widget-windows";
import { catalogEntries, WIDGET_CATALOG, type WidgetKind } from "./catalog";
import { WidgetWindow } from "./WidgetWindow";

const queryClient = new QueryClient();

interface Props {
  /** TEMP: debug controls are replaced by desktop-react-shell launch surfaces. */
  debugSummon?: boolean;
}

const layerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 20,
  pointerEvents: "none",
};

function summon(kind: WidgetKind): void {
  const entry = WIDGET_CATALOG[kind];
  summonWidget(kind, {}, undefined, {
    defaultSize: entry.defaultSize,
    singleton: entry.singleton,
  });
}

function WindowLayerContents({ debugSummon = false }: Props): React.ReactElement {
  const windows = useWidgetWindows();
  const reduced = useReducedMotion();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTargetId, setDrawerTargetId] = useState<string | null>(null);
  const [glints, setGlints] = useState<
    Array<{ id: string; x: number; y: number }>
  >([]);
  const seen = useRef(new Set<string>());
  const glintTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const elements = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    rehydrateWidgetWindows();
    // A truly fresh boot has no persisted windows at all. Only then do we
    // compose the idle-home; any persisted layout is left untouched.
    const freshBoot = getWidgetWindows().length === 0;
    if (!getWidgetWindows().some((item) => item.kind === "orb")) {
      const entry = WIDGET_CATALOG.orb;
      summonWidget("orb", {}, { x: 0.5, y: 0.5 }, {
        defaultSize: entry.defaultSize,
        singleton: entry.singleton,
      });
    }
    if (freshBoot) {
      const clock = WIDGET_CATALOG.clock;
      summonWidget("clock", {}, { x: 0.5, y: 0.15 }, {
        defaultSize: clock.defaultSize,
        singleton: clock.singleton,
      });
    }
  }, []);

  useEffect(() => {
    for (const item of windows) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      if (reduced || Date.now() - item.createdAt > 500) continue;
      setGlints((current) => [
        ...current,
        { id: item.id, x: item.x, y: item.y },
      ]);
      const timer = setTimeout(() => {
        setGlints((current) =>
          current.filter((glint) => glint.id !== item.id),
        );
        glintTimers.current.delete(timer);
      }, 240);
      glintTimers.current.add(timer);
    }
  }, [windows, reduced]);

  useEffect(
    () => () => {
      for (const timer of glintTimers.current) clearTimeout(timer);
    },
    [],
  );

  const onElement = useCallback(
    (id: string, element: HTMLDivElement | null) => {
      if (element) elements.current.set(id, element);
      else elements.current.delete(id);
    },
    [],
  );

  const onDrawerTargetChange = useCallback(
    (id: string, targeted: boolean) => {
      setDrawerTargetId((current) => (targeted ? id : current === id ? null : current));
      if (targeted) setDrawerOpen(true);
    },
    [],
  );

  return (
    <>
      <div data-widget-window-layer style={layerStyle}>
        <AnimatePresence>
          {glints.map((glint) => (
            <motion.div
              key={`glint:${glint.id}`}
              style={{
                position: "absolute",
                left: `${glint.x * 100}%`,
                top: `${glint.y * 100}%`,
                width: 112,
                height: 112,
                borderRadius: "50%",
                // The summon glint: a 220ms transient, not a resting glow, so
                // §1's de-glow does not reach it. Flattening the falloff to a
                // solid fill would turn the flash into a hard disc.
                background: `radial-gradient(circle, color-mix(in srgb, ${SD_ACCENT} 42%, transparent), transparent 70%)`,
                transform: "translate(-50%, -50%)",
              }}
              initial={{ opacity: 0, scale: 0.35 }}
              animate={{ opacity: [0, 1, 0], scale: 1.35 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [...HUD_EASE_OUT_QUART] }}
            />
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {windows.map((item) => (
            <WidgetWindow
              key={item.id}
              window={item}
              onElement={onElement}
              onDrawerTargetChange={onDrawerTargetChange}
            />
          ))}
        </AnimatePresence>
      </div>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        targeted={drawerTargetId !== null}
      />

      {/* TEMP: replaced by desktop-react-shell at merge. */}
      {debugSummon ? (
        <nav
          aria-label="Debug widget summon controls"
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            zIndex: 30,
            display: "flex",
            gap: 6,
            padding: 6,
            border: `1px solid ${SD_SURFACES.line}`,
            borderRadius: SD_RADIUS.panel,
            background: SD_SURFACES.darkBox,
            fontFamily: STUDIO_MONO,
          }}
        >
          {catalogEntries().map(([kind, entry]) => (
            <button
              key={kind}
              type="button"
              onClick={() => summon(kind)}
              className="studio-drawer-tile"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 8px",
                border: `1px solid ${SD_SURFACES.line}`,
                borderRadius: SD_RADIUS.tile,
                color: SD_INK.dull,
                background: SD_SURFACES.box,
                font: "inherit",
                fontSize: 11,
                letterSpacing: "0.06em",
                cursor: "pointer",
              }}
            >
              {/* 16 is the floor for the dimensional family; at the old 11 the
                  body gradient collapsed into a smudge. */}
              <entry.icon size={16} aria-hidden />
              {entry.label}
            </button>
          ))}
        </nav>
      ) : null}

      {/* Hand-cursor surface: opt-in webcam gesture tracking → reticle + pointer
          synthesis over the widget DOM. Inert until toggled on. */}
      <HandTrackingLayer />
    </>
  );
}

export function WidgetWindowLayer(props: Props): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <WindowLayerContents {...props} />
    </QueryClientProvider>
  );
}
