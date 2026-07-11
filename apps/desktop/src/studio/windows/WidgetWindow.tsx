import * as React from "react";
import { Suspense, useRef, type CSSProperties, type PointerEvent } from "react";
import { Minus, Pin, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { STUDIO_COLORS, STUDIO_MONO } from "../tokens";
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

const frameStyle: CSSProperties = {
  position: "absolute",
  display: "flex",
  minHeight: 0,
  flexDirection: "column",
  overflow: "hidden",
  border: `1px solid color-mix(in srgb, ${STUDIO_COLORS.rule} 85%, transparent)`,
  borderRadius: 10,
  color: STUDIO_COLORS.text,
  background: `color-mix(in srgb, ${STUDIO_COLORS.surface} 92%, transparent)`,
  boxShadow: `0 20px 56px color-mix(in srgb, ${STUDIO_COLORS.shadow} 78%, transparent)`,
  backdropFilter: "blur(18px)",
  pointerEvents: "auto",
};

const chromeButtonStyle: CSSProperties = {
  display: "grid",
  width: 24,
  height: 24,
  placeItems: "center",
  padding: 0,
  border: 0,
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
  const entry = WIDGET_CATALOG[item.kind];
  const catalogEntry = entry as typeof entry & { permanent?: boolean };
  const stowable =
    item.kind !== ("orb" as WidgetWindowInstance["kind"]) &&
    catalogEntry.permanent !== true;
  const Content = entry.component;

  const setRoot = (element: HTMLDivElement | null): void => {
    rootRef.current = element;
    onElement(item.id, element);
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
    const rect =
      session.mode === "move"
        ? clampToStage({
            ...session.start,
            x: session.start.x + dxPx / stage.width,
            y: session.start.y + dyPx / stage.height,
          })
        : clampToStage({
            ...session.start,
            w: session.start.w + dxPx / stage.width,
            h: session.start.h + dyPx / stage.height,
          });
    applyWindowGeometry(root, rect);
    if (session.mode === "move" && stowable) {
      onDrawerTargetChange(item.id, isNearDrawer(event.clientX, event.clientY));
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
    onDrawerTargetChange(item.id, false);
    if (
      !session?.moved ||
      session.pointerId !== event.pointerId ||
      !stage?.width ||
      !stage.height
    ) {
      return;
    }
    const dx = (event.clientX - session.startClientX) / stage.width;
    const dy = (event.clientY - session.startClientY) / stage.height;
    if (session.mode === "move") {
      if (!cancelled && stowable && isNearDrawer(event.clientX, event.clientY)) {
        stowWidget(item.id);
        return;
      }
      moveWidget(item.id, session.start.x + dx, session.start.y + dy);
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
      onPointerDown={() => focusWidget(item.id)}
      initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
      layoutId={`widget:${item.id}`}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
      transition={{ duration: reduced ? 0 : 0.18 }}
      style={{
        ...frameStyle,
        left: `${(item.x - item.w / 2) * 100}%`,
        top: `${(item.y - item.h / 2) * 100}%`,
        width: `${item.w * 100}%`,
        height: `${item.h * 100}%`,
        zIndex: item.z,
      }}
    >
      <header
        style={{
          display: "flex",
          height: 32,
          flexShrink: 0,
          touchAction: "none",
          alignItems: "center",
          gap: 8,
          padding: "0 8px 0 10px",
          borderBottom: `1px solid ${STUDIO_COLORS.rule}`,
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
            onClick={() => stowWidget(item.id)}
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
          style={chromeButtonStyle}
        >
          <X size={13} aria-hidden />
        </button>
      </header>

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
    </motion.div>
  );
}
