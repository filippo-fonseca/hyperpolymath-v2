import * as React from "react";
import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { summonWidget, type WidgetWindowInstance } from "../state/widget-windows";
import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";
import { catalogEntries, type WidgetKind, WIDGET_CATALOG } from "../windows/catalog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targeted?: boolean;
  windows: readonly WidgetWindowInstance[];
}

interface CatalogDrag {
  kind: WidgetKind;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
}

const drawerButtonStyle: CSSProperties = {
  display: "flex",
  minWidth: 82,
  minHeight: 52,
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  touchAction: "none",
  border: `1px solid ${STUDIO_COLORS.rule}`,
  borderRadius: 7,
  color: STUDIO_COLORS.text,
  background: STUDIO_COLORS.background,
  cursor: "grab",
  fontFamily: STUDIO_MONO,
};

function stageDropPosition(
  clientX: number,
  clientY: number,
): { x: number; y: number } | undefined {
  const stage = document.querySelector<HTMLElement>("[data-studio-stage]");
  const rect = stage?.getBoundingClientRect();
  if (
    !rect?.width ||
    !rect.height ||
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    return undefined;
  }
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

function summon(kind: WidgetKind, at?: { x: number; y: number }): void {
  const entry = WIDGET_CATALOG[kind];
  summonWidget(kind, {}, at, {
    defaultSize: entry.defaultSize,
    singleton: entry.singleton,
  });
}

function propsHint(item: WidgetWindowInstance): string {
  const url = item.props.url;
  if (typeof url === "string" && url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }
  for (const key of ["city", "title", "name", "query"]) {
    const value = item.props[key];
    if (typeof value === "string" && value) return value;
  }
  return "Saved";
}

function isStowable(item: WidgetWindowInstance): boolean {
  const entry = WIDGET_CATALOG[item.kind] as
    | ({ permanent?: boolean } & object)
    | undefined;
  return item.kind !== ("orb" as WidgetKind) && entry?.permanent !== true;
}

export function Drawer({
  open,
  onOpenChange,
  targeted = false,
  windows,
}: Props): React.ReactElement {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<CatalogDrag | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<CatalogDrag | null>(null);

  const startCatalogDrag = (
    kind: WidgetKind,
    event: PointerEvent<HTMLButtonElement>,
  ): void => {
    if (event.button !== 0) return;
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveCatalogDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const moved =
      current.moved ||
      Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >= 5;
    const next = { ...current, x: event.clientX, y: event.clientY, moved };
    dragRef.current = next;
    if (moved) {
      suppressClick.current = true;
      setDrag(next);
    }
  };

  const endCatalogDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (!current.moved) return;
    const drawerRect = rootRef.current?.getBoundingClientRect();
    const overDrawer =
      drawerRect &&
      event.clientX >= drawerRect.left &&
      event.clientX <= drawerRect.right &&
      event.clientY >= drawerRect.top &&
      event.clientY <= drawerRect.bottom;
    const at = overDrawer
      ? undefined
      : stageDropPosition(event.clientX, event.clientY);
    if (at) summon(current.kind, at);
  };

  return (
    <motion.aside
      ref={rootRef}
      data-widget-drawer
      aria-label="Widget drawer"
      layout
      transition={{ duration: reduced ? 0 : 0.18, ease: "easeOut" }}
      style={{
        position: "absolute",
        left: "50%",
        bottom: 0,
        zIndex: 40,
        width: open ? "min(760px, calc(100% - 32px))" : 136,
        padding: open ? "8px 10px 10px" : "5px 14px 4px",
        border: `1px solid ${targeted ? STUDIO_COLORS.accent : STUDIO_COLORS.rule}`,
        borderBottom: 0,
        borderRadius: "10px 10px 0 0",
        color: STUDIO_COLORS.text,
        background: STUDIO_COLORS.surface,
        boxShadow: targeted
          ? `0 -10px 34px color-mix(in srgb, ${STUDIO_COLORS.accent} 22%, transparent)`
          : `0 -12px 30px color-mix(in srgb, ${STUDIO_COLORS.shadow} 72%, transparent)`,
        fontFamily: STUDIO_MONO,
        pointerEvents: "auto",
        transform: "translateX(-50%)",
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="widget-drawer-tray"
        onClick={() => onOpenChange(!open)}
        style={{
          display: "flex",
          width: "100%",
          minHeight: 27,
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 0,
          border: 0,
          color: STUDIO_COLORS.muted,
          background: "transparent",
          cursor: "pointer",
          font: "inherit",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        <span aria-hidden style={{ width: 18, height: 2, background: STUDIO_COLORS.accent }} />
        Widgets
        {open ? <ChevronDown size={12} aria-hidden /> : <ChevronUp size={12} aria-hidden />}
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id="widget-drawer-tray"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.16 }}
            style={{ display: "flex", minWidth: 0, overflow: "hidden" }}
          >
            <section aria-labelledby="drawer-catalog-label" style={{ minWidth: 0, flex: 1 }}>
              <h2
                id="drawer-catalog-label"
                style={{
                  margin: "5px 0 7px",
                  color: STUDIO_COLORS.muted,
                  fontSize: 8,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                }}
              >
                Catalog
              </h2>
              <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 1 }}>
                {catalogEntries().map(([kind, entry]) => (
                  <button
                    key={kind}
                    type="button"
                    aria-label={`Summon ${entry.label}`}
                    onPointerDown={(event) => startCatalogDrag(kind, event)}
                    onPointerMove={moveCatalogDrag}
                    onPointerUp={endCatalogDrag}
                    onPointerCancel={endCatalogDrag}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      summon(kind);
                    }}
                    style={drawerButtonStyle}
                  >
                    <entry.icon size={17} aria-hidden />
                    <span style={{ fontSize: 9 }}>{entry.label}</span>
                  </button>
                ))}
              </div>
            </section>
            <section
              aria-labelledby="drawer-stowed-label"
              style={{
                width: "38%",
                minWidth: 160,
                marginLeft: 10,
                paddingLeft: 10,
                borderLeft: `1px solid ${STUDIO_COLORS.rule}`,
              }}
            >
              <h2
                id="drawer-stowed-label"
                style={{
                  margin: "5px 0 7px",
                  color: STUDIO_COLORS.muted,
                  fontSize: 8,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                }}
              >
                Stowed
              </h2>
              <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
                {windows.filter((item) => item.stowed && isStowable(item)).length ? (
                  windows
                    .filter((item) => item.stowed && isStowable(item))
                    .map((item) => {
                      const entry = WIDGET_CATALOG[item.kind];
                      return (
                        <motion.div
                          key={item.id}
                          layoutId={`widget:${item.id}`}
                          aria-label={`${entry.label}, ${propsHint(item)}`}
                          style={{
                            display: "flex",
                            minWidth: 92,
                            height: 38,
                            alignItems: "center",
                            gap: 7,
                            padding: "0 9px",
                            border: `1px solid ${STUDIO_COLORS.rule}`,
                            borderRadius: 19,
                            color: STUDIO_COLORS.text,
                            background: STUDIO_COLORS.background,
                          }}
                        >
                          <entry.icon size={14} aria-hidden />
                          <span
                            style={{
                              minWidth: 0,
                              overflow: "hidden",
                              fontSize: 8,
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {propsHint(item)}
                          </span>
                        </motion.div>
                      );
                    })
                ) : (
                  <span style={{ color: STUDIO_COLORS.muted, fontSize: 8, lineHeight: "38px" }}>
                    Empty
                  </span>
                )}
              </div>
            </section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {drag ? (
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 0.92, scale: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              left: drag.x,
              top: drag.y,
              zIndex: 80,
              display: "grid",
              width: 48,
              height: 48,
              placeItems: "center",
              border: `1px solid ${STUDIO_COLORS.accent}`,
              borderRadius: 9,
              color: STUDIO_COLORS.accent,
              background: STUDIO_COLORS.surface,
              pointerEvents: "none",
              transform: "translate(-50%, -50%)",
            }}
          >
            {React.createElement(WIDGET_CATALOG[drag.kind].icon, { size: 19 })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.aside>
  );
}
