"use client";

import { Suspense, useRef } from "react";
import { Pin, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { STUDIOLO } from "../materials/tokens";
import { WIDGET_CATALOG } from "@/lib/studio/windows/catalog";
import type { WidgetWindowInstance } from "@/lib/studio/state/widget-windows";
import {
  closeWidget,
  focusWidget,
  moveWidget,
  resizeWidget,
} from "@/lib/studio/state/widget-windows";
import { emitStudioCue } from "@/lib/studio/audio/cues";
import { useStudioIsHovered } from "@/lib/studio/input/react";
import { clampToStage } from "@/lib/studio/windows/layout";

interface Props {
  window: WidgetWindowInstance;
  onElement: (id: string, element: HTMLDivElement | null) => void;
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

export function WidgetWindow({ window: item, onElement }: Props): React.ReactElement {
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<PointerSession | null>(null);
  const hovered = useStudioIsHovered(`window:${item.id}`);
  const entry = WIDGET_CATALOG[item.kind];
  const Content = entry?.component;

  const setRoot = (element: HTMLDivElement | null): void => {
    rootRef.current = element;
    onElement(item.id, element);
  };

  const startPointer = (mode: PointerSession["mode"], event: React.PointerEvent): void => {
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

  const movePointer = (event: React.PointerEvent): void => {
    const session = sessionRef.current;
    const root = rootRef.current;
    const stage = root?.parentElement?.getBoundingClientRect();
    if (!session || !root || !stage?.width || !stage.height) return;
    const dxPx = event.clientX - session.startClientX;
    const dyPx = event.clientY - session.startClientY;
    if (!session.moved && Math.hypot(dxPx, dyPx) < 4) return;
    if (!session.moved) emitStudioCue("windowGrab");
    session.moved = true;
    const rect = session.mode === "move"
      ? clampToStage({ ...session.start, x: session.start.x + dxPx / stage.width, y: session.start.y + dyPx / stage.height })
      : clampToStage({ ...session.start, w: session.start.w + dxPx / stage.width, h: session.start.h + dyPx / stage.height });
    applyWindowGeometry(root, rect);
  };

  const endPointer = (event: React.PointerEvent): void => {
    const session = sessionRef.current;
    const root = rootRef.current;
    const stage = root?.parentElement?.getBoundingClientRect();
    sessionRef.current = null;
    if (!session?.moved || !stage?.width || !stage.height) return;
    const dx = (event.clientX - session.startClientX) / stage.width;
    const dy = (event.clientY - session.startClientY) / stage.height;
    if (session.mode === "move") moveWidget(item.id, session.start.x + dx, session.start.y + dy);
    else resizeWidget(item.id, session.start.w + dx, session.start.h + dy);
  };

  const focused = hovered;
  return (
    <motion.div
      ref={setRoot}
      data-widget-window={item.id}
      role="dialog"
      aria-label={entry?.label ?? item.kind}
      onPointerDown={() => focusWidget(item.id)}
      initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
      transition={{ duration: reduced ? 0 : 0.18 }}
      className="group absolute flex min-h-0 flex-col overflow-hidden rounded-[10px] border backdrop-blur-xl"
      style={{
        left: `${(item.x - item.w / 2) * 100}%`,
        top: `${(item.y - item.h / 2) * 100}%`,
        width: `${item.w * 100}%`,
        height: `${item.h * 100}%`,
        zIndex: item.z,
        color: STUDIOLO.parchment,
        background: `color-mix(in srgb, ${STUDIOLO.deepVellum} 84%, transparent)`,
        borderColor: focused
          ? `color-mix(in srgb, ${STUDIOLO.jarvisCyan} 72%, transparent)`
          : `color-mix(in srgb, ${STUDIOLO.brass} 30%, transparent)`,
        boxShadow: focused
          ? `0 0 28px color-mix(in srgb, ${STUDIOLO.jarvisCyan} 22%, transparent), 0 22px 60px color-mix(in srgb, ${STUDIOLO.nightwalnut} 72%, transparent)`
          : `0 20px 56px color-mix(in srgb, ${STUDIOLO.nightwalnut} 72%, transparent)`,
      }}
    >
      <header
        className="flex h-8 shrink-0 touch-none select-none items-center gap-2 border-b px-2.5"
        style={{ borderColor: `color-mix(in srgb, ${STUDIOLO.brass} 18%, transparent)` }}
        onPointerDown={(event) => startPointer("move", event)}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <span
          className="min-w-0 flex-1 truncate font-mono text-[9px] font-medium uppercase tracking-[0.18em]"
          style={{ color: STUDIOLO.moonlace }}
        >
          {entry?.label ?? item.kind}
        </span>
        <div className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            aria-label="Pin window to front"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => focusWidget(item.id)}
            className="flex h-6 w-6 items-center justify-center"
            style={{ color: STUDIOLO.moonlace }}
          >
            <Pin size={12} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Close window"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => { emitStudioCue("dismiss"); closeWidget(item.id); }}
            className="flex h-6 w-6 items-center justify-center"
            style={{ color: STUDIOLO.moonlace }}
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {Content ? (
          <Suspense fallback={<div className="h-full animate-pulse opacity-30" />}>
            <Content id={item.id} props={item.props} />
          </Suspense>
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[11px]" style={{ color: STUDIOLO.moonlace }}>
            Widget unavailable
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label="Resize window"
        className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none"
        onPointerDown={(event) => startPointer("resize", event)}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <span
          className="absolute bottom-1 right-1 h-2 w-2 border-b border-r"
          style={{ borderColor: STUDIOLO.brass }}
        />
      </button>
    </motion.div>
  );
}
