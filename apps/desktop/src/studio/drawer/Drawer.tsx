import * as React from "react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  restoreWidget,
  summonWidget,
  type WidgetWindowInstance,
} from "../state/widget-windows";
import { HUD_EASE_OUT_QUART, HUD_SURFACES, STUDIO_COLORS, STUDIO_MONO } from "../tokens";
import { catalogEntries, type WidgetKind, WIDGET_CATALOG } from "../windows/catalog";
import { playDropPop } from "../sound/studio-sfx";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targeted?: boolean;
  windows: readonly WidgetWindowInstance[];
}

interface DrawerDrag {
  kind: WidgetKind;
  stowedId?: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
}

/** One easing curve for all drawer motion, matching the wiki ease-out-quart. */
const EASE_OUT_QUART: [number, number, number, number] = [...HUD_EASE_OUT_QUART];

/** Width of the always-present right-edge hover zone (the collapsed affordance). */
const HOVER_ZONE_WIDTH = 22;
/** Width of the expanded picker panel. */
const PANEL_WIDTH = 288;
/** Grace period before the panel collapses after the cursor leaves it. */
const COLLAPSE_GRACE_MS = 400;
/** Floor for the collapsed rail's height so a jittery hand can still land on it. */
const RAIL_MIN_HEIGHT = 128;
/** The rail must span at least this fraction of the stage height. */
const RAIL_STAGE_FRACTION = 0.4;

/**
 * The hand cursor drives DOM state through synthesized PointerEvents only during
 * an active grab/click — a bare hover never dispatches pointerenter/leave (see
 * pointer-synth.ts), so React's onPointerEnter/onPointerLeave alone only ever
 * fire for the real OS mouse. To make hover-open work for the hand too, we poll
 * the always-present reticle DOM node (`[data-studio-reticle]`, rendered by
 * StudioHandReticle regardless of React context boundaries) and rect-hit-test
 * its live position against the rail/panel — the same "more robust" approach
 * used for hit-testing elsewhere in the hand pipeline, kept self-contained here
 * so this file never has to reach into ../input/.
 */
function reticleViewportPoint(): { x: number; y: number } | null {
  const el = document.querySelector<HTMLElement>(
    '[data-studio-reticle][data-reticle-visible="true"]',
  );
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return { x: rect.left, y: rect.top };
}

function pointInRect(point: { x: number; y: number }, rect: DOMRect): boolean {
  return (
    point.x >= rect.left &&
    point.x <= rect.right &&
    point.y >= rect.top &&
    point.y <= rect.bottom
  );
}

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
  playDropPop();
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

/**
 * A small stylized preview block for a catalog card — a mini "live-look"
 * representation (never a full live widget instance): a few skeleton bars in the
 * widget's accent register so each card reads as that widget at a glance. Kept
 * deterministic per kind so the picker feels stable across opens.
 */
function CardPreview({ kind }: { kind: WidgetKind }): React.ReactElement {
  const bar = (width: string, opacity: number): CSSProperties => ({
    height: 5,
    width,
    borderRadius: 3,
    background: `color-mix(in srgb, ${STUDIO_COLORS.accent} ${Math.round(opacity * 100)}%, transparent)`,
  });
  // Per-kind skeleton shapes so a card evokes its widget without rendering one.
  const layouts: Partial<Record<WidgetKind, React.ReactElement>> = {
    clock: (
      <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
        <div style={{ ...bar("54%", 0.6), height: 12 }} />
      </div>
    ),
    weather: (
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: "100%", padding: "0 4px" }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: `color-mix(in srgb, ${STUDIO_COLORS.accent} 45%, transparent)` }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={bar("46px", 0.55)} />
          <div style={bar("30px", 0.3)} />
        </div>
      </div>
    ),
    browser: (
      <div style={{ display: "flex", flexDirection: "column", gap: 5, height: "100%", padding: "4px 6px" }}>
        <div style={bar("70%", 0.5)} />
        <div style={bar("100%", 0.2)} />
        <div style={bar("100%", 0.2)} />
        <div style={bar("60%", 0.2)} />
      </div>
    ),
  };
  return (
    layouts[kind] ?? (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%", padding: "5px 6px", justifyContent: "center" }}>
        <div style={bar("80%", 0.42)} />
        <div style={bar("100%", 0.22)} />
        <div style={bar("55%", 0.22)} />
      </div>
    )
  );
}

const microLabelStyle: CSSProperties = {
  margin: 0,
  color: STUDIO_COLORS.muted,
  fontSize: 8,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
};

export function Drawer({
  open,
  onOpenChange,
  targeted = false,
  windows,
}: Props): React.ReactElement {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLElement | null>(null);
  const railRef = useRef<HTMLButtonElement | null>(null);
  const dragRef = useRef<DrawerDrag | null>(null);
  const suppressClick = useRef(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [drag, setDrag] = useState<DrawerDrag | null>(null);
  const [railHeight, setRailHeight] = useState(RAIL_MIN_HEIGHT);

  // Hover-open with a collapse grace: the cursor (mouse OR synthetic hand
  // pointer) entering the right-edge zone opens the panel; leaving it starts a
  // ~400ms timer that collapses it, so a small overshoot or a reach for a card
  // doesn't snap it shut. A drag-near (`targeted`) force-holds it open.
  const clearCollapse = (): void => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
  };
  const openNow = (): void => {
    clearCollapse();
    if (!open) onOpenChange(true);
  };
  const scheduleCollapse = (): void => {
    clearCollapse();
    collapseTimer.current = setTimeout(() => {
      onOpenChange(false);
      collapseTimer.current = null;
    }, COLLAPSE_GRACE_MS);
  };
  useEffect(() => clearCollapse, []);
  // While a widget is dragged near the drawer, hold it open and cancel any
  // pending collapse so the drop target stays revealed.
  useEffect(() => {
    if (targeted) openNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targeted]);

  // Size the collapsed rail to at least 40% of the stage height (floor
  // RAIL_MIN_HEIGHT) so a jittery hand has a generously tall target to land on.
  // Re-measures on resize; a ResizeObserver on the stage keeps it correct across
  // window/panel resizes without polling.
  useEffect(() => {
    const measure = (): void => {
      const stage = document.querySelector<HTMLElement>("[data-studio-stage]");
      const stageHeight = stage?.getBoundingClientRect().height ?? 0;
      setRailHeight(Math.max(RAIL_MIN_HEIGHT, stageHeight * RAIL_STAGE_FRACTION));
    };
    measure();
    const stage = document.querySelector<HTMLElement>("[data-studio-stage]");
    if (typeof ResizeObserver === "undefined" || !stage) {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Hand-hover coverage: the synthetic hand pointer only dispatches real DOM
  // PointerEvents during an active grab/click, never for a bare hover (the hub
  // resolves hover purely from cursor position, with no enter/leave dispatch —
  // see pointer-synth.ts). So onPointerEnter/onPointerLeave above only ever fire
  // for the real OS mouse. To cover the hand too, poll the always-present
  // reticle node's live position each frame and rect-hit-test it against the
  // rail (collapsed) or the whole aside (expanded), driving the exact same
  // openNow/scheduleCollapse used for the mouse so behavior (grace period,
  // targeted-hold, reduced motion) stays identical across both input methods.
  useEffect(() => {
    let frame = 0;
    let wasOver = false;
    const tick = (): void => {
      frame = requestAnimationFrame(tick);
      const point = reticleViewportPoint();
      if (!point) {
        if (wasOver) {
          wasOver = false;
          scheduleCollapse();
        }
        return;
      }
      const hitRect = open
        ? rootRef.current?.getBoundingClientRect()
        : railRef.current?.getBoundingClientRect();
      const over = !!hitRect && pointInRect(point, hitRect);
      if (over && !wasOver) {
        wasOver = true;
        openNow();
      } else if (!over && wasOver) {
        wasOver = false;
        scheduleCollapse();
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const startDrag = (
    kind: WidgetKind,
    event: PointerEvent<HTMLButtonElement>,
    stowedId?: string,
  ): void => {
    if (event.button !== 0) return;
    dragRef.current = {
      kind,
      stowedId,
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

  const moveDrag = (event: PointerEvent<HTMLButtonElement>): void => {
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

  const endDrag = (
    event: PointerEvent<HTMLButtonElement>,
    cancelled = false,
  ): void => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (cancelled) {
      suppressClick.current = false;
      return;
    }
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
    if (!at) return;
    if (current.stowedId) {
      restoreWidget(current.stowedId, at);
      playDropPop();
    } else {
      summon(current.kind, at);
    }
  };

  const stowedWidgets = windows.filter((item) => item.stowed && isStowable(item));

  return (
    <motion.aside
      ref={rootRef}
      data-widget-drawer
      aria-label="Widget picker"
      onPointerEnter={openNow}
      onPointerLeave={scheduleCollapse}
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "stretch",
        // The panel slides in FROM the right; the aside itself spans the panel
        // width so its hover/leave zone tracks the revealed surface. Collapsed,
        // only the slim edge strip below is interactive.
        width: PANEL_WIDTH,
        pointerEvents: "none",
      }}
    >
      {/* Slim right-edge hover strip: the always-present collapsed affordance.
          A faint vertical cyan hairline + grip dots hint the pull-out. */}
      <button
        ref={railRef}
        type="button"
        aria-label={open ? "Widget picker open" : "Open widget picker"}
        aria-expanded={open}
        onPointerEnter={openNow}
        onFocus={openNow}
        onClick={() => onOpenChange(!open)}
        style={{
          position: "absolute",
          top: "50%",
          right: 0,
          width: HOVER_ZONE_WIDTH,
          height: railHeight,
          transform: "translateY(-50%)",
          display: "grid",
          placeItems: "center",
          gap: 4,
          border: 0,
          borderRadius: "8px 0 0 8px",
          background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${STUDIO_COLORS.accent} ${open ? 0 : 10}%, transparent))`,
          color: STUDIO_COLORS.accent,
          cursor: "pointer",
          opacity: open ? 0 : 1,
          transition: reduced ? "none" : "opacity 160ms",
          pointerEvents: open ? "none" : "auto",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 3,
            height: 44,
            borderRadius: 3,
            background: `color-mix(in srgb, ${STUDIO_COLORS.accent} 55%, transparent)`,
            boxShadow: `0 0 12px color-mix(in srgb, ${STUDIO_COLORS.accent} 40%, transparent)`,
          }}
        />
      </button>

      {/* The slide-out picker panel (macOS notification-center feel): rests
          off-stage to the right, animates in leftward when opened. */}
      <AnimatePresence>
        {open ? (
          <motion.div
            id="widget-picker-panel"
            initial={{ x: reduced ? 0 : "100%", opacity: reduced ? 1 : 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: reduced ? 0 : "100%", opacity: reduced ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : 0.26, ease: EASE_OUT_QUART }}
            style={{
              display: "flex",
              width: "100%",
              flexDirection: "column",
              minHeight: 0,
              margin: 8,
              padding: "14px 12px",
              border: `1px solid ${targeted ? STUDIO_COLORS.accent : HUD_SURFACES.line}`,
              borderRadius: 14,
              color: STUDIO_COLORS.text,
              background: `color-mix(in srgb, ${HUD_SURFACES.raised} 92%, transparent)`,
              backdropFilter: "blur(20px)",
              boxShadow: targeted
                ? `0 18px 44px color-mix(in srgb, ${STUDIO_COLORS.accent} 22%, transparent)`
                : `0 20px 50px color-mix(in srgb, ${STUDIO_COLORS.shadow} 74%, transparent)`,
              fontFamily: STUDIO_MONO,
              pointerEvents: "auto",
            }}
          >
            {/* Stowed section on top — chip-restore for stowed widgets. */}
            {stowedWidgets.length ? (
              <section aria-labelledby="picker-stowed-label" style={{ flexShrink: 0, marginBottom: 12 }}>
                <h2 id="picker-stowed-label" style={{ ...microLabelStyle, margin: "0 2px 8px" }}>
                  Stowed
                </h2>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {stowedWidgets.map((item) => {
                    const entry = WIDGET_CATALOG[item.kind];
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        layoutId={`widget:${item.id}`}
                        aria-label={`${entry.label}, ${propsHint(item)}`}
                        title={`Restore ${entry.label}`}
                        onPointerDown={(event) => startDrag(item.kind, event, item.id)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={(event) => endDrag(event, true)}
                        onClick={() => {
                          if (suppressClick.current) {
                            suppressClick.current = false;
                            return;
                          }
                          restoreWidget(item.id);
                          playDropPop();
                        }}
                        className="studio-drawer-tile"
                        style={{
                          display: "flex",
                          minWidth: 108,
                          height: 40,
                          alignItems: "center",
                          gap: 8,
                          padding: "0 11px",
                          border: `1px solid ${HUD_SURFACES.line}`,
                          borderRadius: 20,
                          color: STUDIO_COLORS.text,
                          background: HUD_SURFACES.sunken,
                          cursor: "grab",
                          fontFamily: STUDIO_MONO,
                          touchAction: "none",
                        }}
                      >
                        <entry.icon size={15} aria-hidden />
                        <span
                          style={{
                            minWidth: 0,
                            overflow: "hidden",
                            fontSize: 9,
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {propsHint(item)}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <h2 id="picker-catalog-label" style={{ ...microLabelStyle, margin: "0 2px 9px" }}>
              Widgets
            </h2>
            {/* Scrollable list of LARGE, hand-friendly preview cards. */}
            <div
              className="studio-custom-scroll"
              aria-labelledby="picker-catalog-label"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 9,
                minHeight: 0,
                overflowY: "auto",
                paddingRight: 2,
              }}
            >
              {catalogEntries()
                .filter(([kind]) => kind !== ("orb" as WidgetKind))
                .map(([kind, entry]) => (
                  <button
                    key={kind}
                    type="button"
                    aria-label={`Summon ${entry.label}`}
                    onPointerDown={(event) => startDrag(kind, event)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={(event) => endDrag(event, true)}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      summon(kind);
                    }}
                    className="studio-drawer-tile"
                    style={{
                      display: "flex",
                      // Hand-friendly rows: comfortably tall (>= 64px) so a
                      // jittery synthetic pointer can land on a card.
                      minHeight: 72,
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      border: `1px solid ${HUD_SURFACES.line}`,
                      borderRadius: 12,
                      color: STUDIO_COLORS.text,
                      background: HUD_SURFACES.sunken,
                      cursor: "grab",
                      fontFamily: STUDIO_MONO,
                      textAlign: "left",
                      touchAction: "none",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: 40,
                        height: 40,
                        flexShrink: 0,
                        borderRadius: 10,
                        border: `1px solid ${HUD_SURFACES.line}`,
                        background: `color-mix(in srgb, ${STUDIO_COLORS.accent} 8%, transparent)`,
                        color: STUDIO_COLORS.accent,
                      }}
                    >
                      <entry.icon size={19} />
                    </span>
                    <span style={{ display: "flex", minWidth: 0, flex: 1, flexDirection: "column", gap: 6 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        {entry.label}
                      </span>
                      <span
                        aria-hidden
                        style={{
                          height: 30,
                          overflow: "hidden",
                          borderRadius: 7,
                          border: `1px solid color-mix(in srgb, ${HUD_SURFACES.line} 70%, transparent)`,
                          background: `color-mix(in srgb, ${STUDIO_COLORS.surface} 60%, transparent)`,
                        }}
                      >
                        <CardPreview kind={kind} />
                      </span>
                    </span>
                  </button>
                ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Drag ghost that follows the pointer while dragging a card / chip out. */}
      <AnimatePresence>
        {drag ? (
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 0.92, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.14, ease: EASE_OUT_QUART }}
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
              background: HUD_SURFACES.raised,
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
