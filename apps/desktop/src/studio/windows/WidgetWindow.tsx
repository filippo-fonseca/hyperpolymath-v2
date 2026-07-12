import * as React from "react";
import {
  Suspense,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { Minus, Pin, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { HUD_EASE_OUT_QUART, HUD_SURFACES, STUDIO_COLORS, STUDIO_MONO } from "../tokens";
import {
  closeWidget,
  focusWidget,
  moveWidget,
  resizeWidget,
  stowWidget,
  type WidgetWindowInstance,
} from "../state/widget-windows";
import { WIDGET_CATALOG } from "./catalog";
import { clampToStage } from "./layout";
import { BurstBubble } from "./BurstBubble";
import {
  edgeOutwardDirection,
  shouldBurst,
  widgetEdgeProgress,
} from "./edge-burst";

/** Transient edge-burst state while a stowable widget is dragged near a border. */
interface BurstState {
  progress: number;
  direction: { x: number; y: number };
  popping: boolean;
}

interface Props {
  window: WidgetWindowInstance;
  onElement: (id: string, element: HTMLDivElement | null) => void;
  onDrawerTargetChange: (id: string, targeted: boolean) => void;
}

interface PointerSession {
  mode: "move" | "resize";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  start: { x: number; y: number; w: number; h: number };
  moved: boolean;
}

export function applyWindowGeometry(
  element: HTMLElement,
  rect: { x: number; y: number; w: number; h: number },
): void {
  element.style.left = `${(rect.x - rect.w / 2) * 100}%`;
  element.style.top = `${(rect.y - rect.h / 2) * 100}%`;
  element.style.width = `${rect.w * 100}%`;
  element.style.height = `${rect.h * 100}%`;
}

/**
 * Glass-depth shadow stack ported from the wiki `.glass-tile` register: an outer
 * drop for lift, a faint specular top edge (very low alpha so it never smears
 * white on the dark canvas), a recessed bottom edge, and a whisper of inset cyan
 * breath. `hover` deepens the drop and lifts the cyan breath; `focus` adds a 1px
 * inset accent ring (never an outer offset, matching the wiki chrome).
 */
function glassShadow(hover: boolean): string {
  return [
    hover
      ? `0 34px 84px color-mix(in srgb, ${STUDIO_COLORS.shadow} 86%, transparent)`
      : `0 20px 56px color-mix(in srgb, ${STUDIO_COLORS.shadow} 78%, transparent)`,
    "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
    "inset 0 -1px 0 rgba(0, 0, 0, 0.4)",
    `inset 0 0 24px color-mix(in srgb, ${STUDIO_COLORS.accent} ${hover ? 9 : 5}%, transparent)`,
  ].join(", ");
}

const frameStyle: CSSProperties = {
  position: "absolute",
  display: "flex",
  minHeight: 0,
  flexDirection: "column",
  overflow: "hidden",
  border: `1px solid color-mix(in srgb, ${STUDIO_COLORS.rule} 85%, transparent)`,
  borderRadius: 10,
  color: STUDIO_COLORS.text,
  background: `color-mix(in srgb, ${HUD_SURFACES.raised} 90%, transparent)`,
  boxShadow: glassShadow(false),
  backdropFilter: "blur(18px)",
  transition: `box-shadow 180ms cubic-bezier(${HUD_EASE_OUT_QUART.join(",")}), border-color 180ms cubic-bezier(${HUD_EASE_OUT_QUART.join(",")})`,
  pointerEvents: "auto",
};

const chromeButtonStyle: CSSProperties = {
  display: "grid",
  width: 24,
  height: 24,
  placeItems: "center",
  padding: 0,
  border: 0,
  borderRadius: 5,
  color: STUDIO_COLORS.muted,
  background: "transparent",
  cursor: "pointer",
};

function isNearDrawer(clientX: number, clientY: number): boolean {
  const drawer = document.querySelector<HTMLElement>("[data-widget-drawer]");
  const rect = drawer?.getBoundingClientRect();
  return Boolean(
    rect &&
      clientX >= rect.left - 72 &&
      clientX <= rect.right + 72 &&
      clientY >= rect.top - 104,
  );
}

export function WidgetWindow({
  window: item,
  onElement,
  onDrawerTargetChange,
}: Props): React.ReactElement {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<PointerSession | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [burst, setBurst] = useState<BurstState | null>(null);
  const entry = WIDGET_CATALOG[item.kind];
  const catalogEntry = entry as typeof entry & { permanent?: boolean };
  const stowable =
    item.kind !== ("orb" as WidgetWindowInstance["kind"]) &&
    catalogEntry.permanent !== true;
  const Content = entry.component;
  const permanent = entry.permanent === true;

  const setRoot = (element: HTMLDivElement | null): void => {
    rootRef.current = element;
    onElement(item.id, element);
  };

  const stowFromHeader = (): void => {
    onDrawerTargetChange(item.id, true);
    requestAnimationFrame(() => {
      stowWidget(item.id);
      onDrawerTargetChange(item.id, false);
    });
  };

  const startPointer = (
    mode: PointerSession["mode"],
    event: PointerEvent<HTMLElement>,
  ): void => {
    if (event.button !== 0) return;
    focusWidget(item.id);
    sessionRef.current = {
      mode,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      start: { x: item.x, y: item.y, w: item.w, h: item.h },
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePointer = (event: PointerEvent<HTMLElement>): void => {
    const session = sessionRef.current;
    const root = rootRef.current;
    const stage = root?.parentElement?.getBoundingClientRect();
    if (
      !session ||
      session.pointerId !== event.pointerId ||
      !root ||
      !stage?.width ||
      !stage.height
    ) {
      return;
    }
    const dxPx = event.clientX - session.startClientX;
    const dyPx = event.clientY - session.startClientY;
    if (!session.moved && Math.hypot(dxPx, dyPx) < 4) return;
    session.moved = true;
    if (!dragging) setDragging(true);
    // The RAW (unclamped) center drives the edge-burst affordance so pushing
    // a widget INTO / past the border is expressible even though the applied
    // geometry is clamped to stay on-stage.
    const rawCenter =
      session.mode === "move"
        ? {
            x: session.start.x + dxPx / stage.width,
            y: session.start.y + dyPx / stage.height,
          }
        : { x: session.start.x, y: session.start.y };
    const rect =
      session.mode === "move"
        ? clampToStage({ ...session.start, x: rawCenter.x, y: rawCenter.y })
        : clampToStage({
            ...session.start,
            w: session.start.w + dxPx / stage.width,
            h: session.start.h + dyPx / stage.height,
          });
    applyWindowGeometry(root, rect);
    if (session.mode === "move" && stowable) {
      const progress = widgetEdgeProgress(rawCenter);
      setBurst(
        progress > 0
          ? {
              progress,
              direction: edgeOutwardDirection(rawCenter),
              popping: false,
            }
          : null,
      );
      // While the burst affordance is armed, the near-border pull owns the
      // gesture; don't also flag the drawer as a target (avoids a double cue).
      onDrawerTargetChange(
        item.id,
        progress <= 0 && isNearDrawer(event.clientX, event.clientY),
      );
    }
  };

  const endPointer = (
    event: PointerEvent<HTMLElement>,
    cancelled = false,
  ): void => {
    const session = sessionRef.current;
    const root = rootRef.current;
    const stage = root?.parentElement?.getBoundingClientRect();
    sessionRef.current = null;
    setDragging(false);
    onDrawerTargetChange(item.id, false);
    if (
      !session?.moved ||
      session.pointerId !== event.pointerId ||
      !stage?.width ||
      !stage.height
    ) {
      setBurst(null);
      return;
    }
    const dx = (event.clientX - session.startClientX) / stage.width;
    const dy = (event.clientY - session.startClientY) / stage.height;
    if (session.mode === "move") {
      const rawCenter = { x: session.start.x + dx, y: session.start.y + dy };
      // Past the burst threshold → pop and stow (drawer-stow lifecycle: a chip
      // appears in the drawer, restorable). The pop plays, then we stow.
      if (!cancelled && stowable && shouldBurst(widgetEdgeProgress(rawCenter))) {
        setBurst((current) =>
          current
            ? { ...current, progress: 1, popping: true }
            : {
                progress: 1,
                direction: edgeOutwardDirection(rawCenter),
                popping: true,
              },
        );
        window.setTimeout(() => stowWidget(item.id), reduced ? 0 : 220);
        return;
      }
      // Released before the threshold → deflate the bubble and let the widget
      // spring back to its clamped, safe position (the forgiving escape).
      setBurst(null);
      if (!cancelled && stowable && isNearDrawer(event.clientX, event.clientY)) {
        stowWidget(item.id);
        return;
      }
      moveWidget(item.id, rawCenter.x, rawCenter.y);
    } else {
      resizeWidget(item.id, session.start.w + dx, session.start.h + dy);
    }
  };

  return (
    <motion.div
      ref={setRoot}
      data-widget-window={item.id}
      role="dialog"
      aria-label={entry.label}
      onPointerDown={(event) => {
        if (permanent) startPointer("move", event);
        else focusWidget(item.id);
      }}
      onPointerMove={permanent ? movePointer : undefined}
      onPointerUp={permanent ? endPointer : undefined}
      onPointerCancel={permanent ? endPointer : undefined}
      onPointerEnter={permanent ? undefined : () => setHovered(true)}
      onPointerLeave={permanent ? undefined : () => setHovered(false)}
      onFocus={permanent ? undefined : () => setFocused(true)}
      onBlur={permanent ? undefined : (event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setFocused(false);
        }
      }}
      initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
      layoutId={`widget:${item.id}`}
      animate={
        permanent
          ? {
              opacity: 1,
              scale: 1,
              left: `${(item.x - item.w / 2) * 100}%`,
              top: `${(item.y - item.h / 2) * 100}%`,
              width: `${item.w * 100}%`,
              height: `${item.h * 100}%`,
            }
          : {
              opacity: 1,
              // Drag-feel: a subtle lift while grabbed, and the widget deflates
              // INTO the bubble skin as burst progress rises (the "shrinking
              // into a bubble about to pop" affordance).
              scale: reduced
                ? 1
                : dragging
                  ? 1.02 - (burst?.progress ?? 0) * 0.16
                  : 1,
            }
      }
      exit={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
      transition={
        permanent
          ? reduced
            ? { duration: 0 }
            : { type: "spring", stiffness: 82, damping: 20, mass: 0.9 }
          : dragging || burst
            ? reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 300, damping: 26, mass: 0.7 }
            : { duration: reduced ? 0 : 0.18 }
      }
      style={{
        ...frameStyle,
        ...(permanent
          ? {
              border: 0,
              borderRadius: "50%",
              background: "transparent",
              boxShadow: "none",
              backdropFilter: "none",
              cursor: "grab",
              touchAction: "none",
            }
          : null),
        ...(!permanent && (dragging || hovered || focused)
          ? {
              borderColor: `color-mix(in srgb, ${STUDIO_COLORS.accent} ${dragging ? 55 : 40}%, ${STUDIO_COLORS.rule})`,
              boxShadow: focused
                ? `${glassShadow(true)}, inset 0 0 0 1px color-mix(in srgb, ${STUDIO_COLORS.accent} 70%, transparent)`
                : glassShadow(true),
              ...(dragging ? { cursor: "grabbing" } : null),
            }
          : null),
        left: `${(item.x - item.w / 2) * 100}%`,
        top: `${(item.y - item.h / 2) * 100}%`,
        width: `${item.w * 100}%`,
        height: `${item.h * 100}%`,
        zIndex: dragging && !permanent ? 9_000 : item.z,
      }}
    >
      {burst ? (
        <BurstBubble
          progress={burst.progress}
          popping={burst.popping}
          direction={burst.direction}
        />
      ) : null}
      {permanent ? null : (
        <header
          style={{
            display: "flex",
            height: 32,
            flexShrink: 0,
            touchAction: "none",
            alignItems: "center",
            gap: 8,
            padding: "0 8px 0 10px",
            background: `color-mix(in srgb, ${HUD_SURFACES.hover} 55%, transparent)`,
            borderBottom: `1px solid ${HUD_SURFACES.line}`,
            cursor: "grab",
          }}
          onPointerDown={(event) => startPointer("move", event)}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={(event) => endPointer(event, true)}
        >
          <span
            style={{
              minWidth: 0,
              flex: 1,
              overflow: "hidden",
              color: STUDIO_COLORS.muted,
              fontFamily: STUDIO_MONO,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textOverflow: "ellipsis",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            {entry.label}
          </span>
          <button
            type="button"
            aria-label="Pin window to front"
            title="Pin to front"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => focusWidget(item.id)}
            className="studio-chrome-btn"
            style={chromeButtonStyle}
          >
            <Pin size={12} aria-hidden />
          </button>
          {stowable ? (
            <button
              type="button"
              aria-label="Stow window"
              title="Stow"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={stowFromHeader}
              className="studio-chrome-btn"
              style={chromeButtonStyle}
            >
              <Minus size={13} aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close window"
            title="Close"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => closeWidget(item.id)}
            className="studio-chrome-btn"
            style={chromeButtonStyle}
          >
            <X size={13} aria-hidden />
          </button>
        </header>
      )}

      <div style={{ minHeight: 0, flex: 1, overflow: "hidden" }}>
        <Suspense
          fallback={
            <div
              aria-label="Loading widget"
              style={{ height: "100%", background: STUDIO_COLORS.surface }}
            />
          }
        >
          <Content id={item.id} props={item.props} />
        </Suspense>
      </div>

      {permanent ? null : (
        <button
          type="button"
          aria-label="Resize window"
          title="Resize"
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            width: 20,
            height: 20,
            touchAction: "none",
            border: 0,
            borderRight: `2px solid ${STUDIO_COLORS.accent}`,
            borderBottom: `2px solid ${STUDIO_COLORS.accent}`,
            background: "transparent",
            cursor: "nwse-resize",
          }}
          onPointerDown={(event) => startPointer("resize", event)}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={(event) => endPointer(event, true)}
        />
      )}
    </motion.div>
  );
}
