import * as React from "react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  BrowserIcon,
  CameraIcon,
  ClockIcon,
  NewsIcon,
  PageIcon,
  SettingsIcon,
  WeatherIcon,
  WhatsappIcon,
  type DimensionalIconProps,
} from "@hyperpolymath/ui-icons";

import { summonWidget } from "../state/widget-windows";
import {
  HUD_EASE_OUT_QUART,
  SD_ACCENT,
  SD_DURATION,
  SD_FONT,
  SD_HAIRLINE,
  SD_INK,
  SD_RADIUS,
  SD_SURFACES,
} from "../tokens";
import { catalogEntries, type WidgetKind, WIDGET_CATALOG } from "../windows/catalog";
import { playDropPop } from "../sound/studio-sfx";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targeted?: boolean;
}

interface DrawerDrag {
  kind: WidgetKind;
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
    singleton: entry.singleton,
  });
  playDropPop();
}

/**
 * Dimensional feature icons for the picker, keyed by widget kind.
 *
 * The catalog's own `entry.icon` is a flat lucide glyph, which is the right
 * weight for window-chrome controls but not for a picker card — §9 gives a card
 * header a dimensional icon, and D3 authored these desktop motifs for exactly
 * these nouns. The catalog lives in another unit's fence, so the mapping is kept
 * local here rather than pushed into `WIDGET_CATALOG`; `entry.icon` stays the
 * fallback so a new kind can never render iconless.
 */
const DIMENSIONAL_ICONS: Partial<Record<WidgetKind, React.ComponentType<DimensionalIconProps>>> = {
  browser: BrowserIcon,
  whatsapp: WhatsappIcon,
  weather: WeatherIcon,
  news: NewsIcon,
  clock: ClockIcon,
  camera: CameraIcon,
  settings: SettingsIcon,
  card: (props) => <PageIcon {...props} kind="note" />,
};

function KindIcon({
  kind,
  size,
}: {
  kind: WidgetKind;
  size: number;
}): React.ReactElement {
  const Dimensional = DIMENSIONAL_ICONS[kind];
  if (Dimensional) return <Dimensional size={size} />;
  const Flat = WIDGET_CATALOG[kind].icon;
  return <Flat size={size} />;
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
    background: `color-mix(in srgb, ${SD_ACCENT} ${Math.round(opacity * 100)}%, transparent)`,
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
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: `color-mix(in srgb, ${SD_ACCENT} 45%, transparent)` }} />
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

/**
 * Section eyebrow — the mono register's whole job (§3): 11px, uppercase, wide
 * tracking, faint ink. Mono is a micro-label face here and nowhere else in this
 * panel; the cards themselves speak Space Grotesk.
 */
const microLabelStyle: CSSProperties = {
  margin: 0,
  color: SD_INK.faint,
  fontFamily: SD_FONT.mono,
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

/**
 * Card v2 hover, scoped to this panel.
 *
 * The shared `.studio-drawer-tile` in `studio.css` predates the sd register: it
 * changes the fill, strengthens the border to a hard-coded old-blue
 * (`--studio-accent` is never actually declared, so its #2fa8ff fallback is what
 * paints), and lifts the tile 1px. Card v2 says hover moves the BORDER and
 * nothing else — no fill change, no lift. `studio.css` is another unit's fence,
 * so rather than reach across it these tiles carry their own class and this
 * block owns the interaction. The old class now has no consumers.
 */
const TILE_CLASS = "sd-drawer-tile";

function DrawerStyleBlock(): React.ReactElement {
  return (
    <style>{`
.${TILE_CLASS} {
  border: 1px solid ${SD_SURFACES.line};
  background: ${SD_SURFACES.box};
  box-shadow: ${SD_HAIRLINE.card};
  transition: border-color ${SD_DURATION.micro}ms cubic-bezier(0.25, 1, 0.5, 1);
}
.${TILE_CLASS}:hover {
  border-color: ${SD_SURFACES.frame};
}
.${TILE_CLASS}:focus-visible {
  outline: none;
  border-color: ${SD_ACCENT};
  box-shadow: ${SD_HAIRLINE.card}, 0 0 0 2px color-mix(in srgb, ${SD_ACCENT} 45%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .${TILE_CLASS} { transition: none; }
}
/* Hairline track, accent-muted thumb — the picker's list is the only scroller
   in this panel, and the shared .studio-custom-scroll still resolves to the old
   accent's fallback hex. */
.sd-drawer-scroll {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, ${SD_ACCENT} 34%, transparent) transparent;
}
.sd-drawer-scroll::-webkit-scrollbar { width: 7px; }
.sd-drawer-scroll::-webkit-scrollbar-track { background: transparent; }
.sd-drawer-scroll::-webkit-scrollbar-thumb {
  border-radius: ${SD_RADIUS.chip}px;
  background: color-mix(in srgb, ${SD_ACCENT} 30%, transparent);
}
.sd-drawer-scroll::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, ${SD_ACCENT} 48%, transparent);
}
`}</style>
  );
}

export function Drawer({
  open,
  onOpenChange,
  targeted = false,
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
    summon(current.kind, at);
  };

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
          borderRadius: `${SD_RADIUS.tile}px 0 0 ${SD_RADIUS.tile}px`,
          background: `linear-gradient(90deg, transparent, color-mix(in srgb, ${SD_SURFACES.box} ${open ? 0 : 80}%, transparent))`,
          color: SD_ACCENT,
          cursor: "pointer",
          opacity: open ? 0 : 1,
          transition: reduced ? "none" : `opacity ${SD_DURATION.entrance}ms`,
          pointerEvents: open ? "none" : "auto",
        }}
      >
        {/* The grip. It was an accent bar wearing a 12px glow halo; §16 bans glow
            rings, so depth now comes from the rail's own surface wash and the
            grip is a flat accent hairline. */}
        <span
          aria-hidden
          style={{
            width: 3,
            height: 44,
            borderRadius: SD_RADIUS.full,
            background: `color-mix(in srgb, ${SD_ACCENT} 55%, transparent)`,
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
              // Targeted (a widget is being dragged at the drawer) moves the
              // BORDER and nothing else — the same law card v2 gives hover. It
              // used to swap the drop shadow for a 44px accent bloom, which was
              // the one real glow left on this surface.
              border: `1px solid ${targeted ? SD_ACCENT : SD_SURFACES.line}`,
              borderRadius: SD_RADIUS.card,
              color: SD_INK.base,
              // Glass STAYS: this panel is chrome, not content (sealed D1).
              background: `color-mix(in srgb, ${SD_SURFACES.app} 92%, transparent)`,
              backdropFilter: "blur(20px)",
              // Depth is the sd idiom now: the white inset top hairline does the
              // lifting and the shadow only grounds the panel, instead of a 50px
              // shade sitting under a glow.
              boxShadow: `${SD_HAIRLINE.panel}, 0 12px 28px rgb(0 0 0 / 0.28)`,
              transition: reduced
                ? "none"
                : `border-color ${SD_DURATION.micro}ms cubic-bezier(0.25, 1, 0.5, 1)`,
              fontFamily: SD_FONT.sans,
              pointerEvents: "auto",
            }}
          >
            <DrawerStyleBlock />
            <h2 id="picker-catalog-label" style={{ ...microLabelStyle, margin: "0 2px 9px" }}>
              Widgets
            </h2>
            {/* Scrollable list of LARGE, hand-friendly preview cards. */}
            <div
              className="sd-drawer-scroll"
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
                    className={TILE_CLASS}
                    style={{
                      display: "flex",
                      // Hand-friendly rows: comfortably tall (>= 64px) so a
                      // jittery synthetic pointer can land on a card.
                      minHeight: 72,
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      // Card v2: 14px is this radius' one sanctioned home.
                      borderRadius: SD_RADIUS.card,
                      color: SD_INK.base,
                      cursor: "grab",
                      fontFamily: SD_FONT.sans,
                      textAlign: "left",
                      touchAction: "none",
                    }}
                  >
                    {/* §9 heads a card with a bare dimensional icon. The old
                        accent-tinted, hairlined plate around it was a border
                        inside a border, which the nesting rule bans. */}
                    <span
                      aria-hidden
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: 36,
                        height: 36,
                        flexShrink: 0,
                      }}
                    >
                      <KindIcon kind={kind} size={36} />
                    </span>
                    <span style={{ display: "flex", minWidth: 0, flex: 1, flexDirection: "column", gap: 6 }}>
                      {/* Card title, not an eyebrow: sans at the §9 display
                          tracking. It was uppercase mono, which spends the
                          instrument face on a name it does not label. */}
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {entry.label}
                      </span>
                      {/* Inset sub-card: --sd-input fill at 10px, no border —
                          the ladder carries the step, not a second hairline. */}
                      <span
                        aria-hidden
                        style={{
                          height: 30,
                          overflow: "hidden",
                          borderRadius: SD_RADIUS.pillInset,
                          background: SD_SURFACES.input,
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
              border: `1px solid ${SD_ACCENT}`,
              borderRadius: SD_RADIUS.tile,
              color: SD_ACCENT,
              background: SD_SURFACES.box,
              boxShadow: SD_HAIRLINE.card,
              pointerEvents: "none",
              transform: "translate(-50%, -50%)",
            }}
          >
            <KindIcon kind={drag.kind} size={28} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.aside>
  );
}
