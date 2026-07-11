"use client";

/**
 * Z-stack contract: this layer occupies z-20; its children use local z values.
 * It stays below z-30 HUD controls and z-35 hand reticle. The z-40 focus scrim
 * leaves windows visible behind it while making them non-interactive.
 */
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { WidgetWindow, applyWindowGeometry } from "./WidgetWindow";
import { WidgetSummonMenu } from "./WidgetSummonMenu";
import { StudioPushToTalk } from "./StudioPushToTalk";
import {
  closeWidget,
  focusWidget,
  getWidgetWindows,
  moveWidget,
  rehydrateWidgetWindows,
  useWidgetWindows,
} from "@/lib/studio/state/widget-windows";
import { useStudioHoverProvider, useStudioInput, useStudioIntent, useStudioPhase } from "@/lib/studio/input/react";
import { clampToStage } from "@/lib/studio/windows/layout";
import { emitStudioCue } from "@/lib/studio/audio/cues";
import { useStudioData } from "../data/useStudioData";
import { useStudioVoiceBridge } from "@/lib/studio/windows/voice-bridge";
import { STUDIOLO } from "../materials/tokens";
import { useActiveWidget } from "@/lib/studio/state/active-widget";

interface HandSession {
  id: string;
  startX: number;
  startY: number;
  anchorNx: number | null;
  anchorNy: number | null;
}

export function WidgetWindowLayer(): React.ReactElement {
  const windows = useWidgetWindows();
  const activeFocus = useActiveWidget();
  const reduced = useReducedMotion();
  const [glints, setGlints] = useState<Array<{ id: string; x: number; y: number }>>([]);
  const seen = useRef(new Set<string>());
  const glintTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const { userId } = useStudioData();
  useStudioVoiceBridge(userId);
  const input = useStudioInput();
  const elements = useRef(new Map<string, HTMLDivElement>());
  const hand = useRef<HandSession | null>(null);

  useEffect(() => rehydrateWidgetWindows(), []);

  useEffect(() => {
    for (const item of windows) {
      if (seen.current.has(item.id)) continue;
      seen.current.add(item.id);
      if (reduced || Date.now() - item.createdAt > 500) continue;
      setGlints((current) => [...current, { id: item.id, x: item.x, y: item.y }]);
      const timer = setTimeout(() => {
        setGlints((current) => current.filter((glint) => glint.id !== item.id));
        glintTimers.current.delete(timer);
      }, 240);
      glintTimers.current.add(timer);
    }
  }, [windows, reduced]);

  useEffect(() => () => {
    for (const timer of glintTimers.current) clearTimeout(timer);
  }, []);

  const onElement = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) elements.current.set(id, element);
    else elements.current.delete(id);
  }, []);

  useStudioHoverProvider({
    id: "widget-windows",
    priority: 100,
    resolve: (cursor) => {
      if (!cursor.active || activeFocus !== null) return null;
      const candidates = getWidgetWindows().slice().sort((a, b) => b.z - a.z);
      for (const item of candidates) {
        const element = elements.current.get(item.id);
        const rect = element?.getBoundingClientRect();
        const stage = element?.parentElement?.getBoundingClientRect();
        const x = cursor.x + (stage?.left ?? 0);
        const y = cursor.y + (stage?.top ?? 0);
        if (rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return `window:${item.id}`;
        }
      }
      return null;
    },
  });

  useStudioPhase((phase) => {
    if (phase.type === "grabStart" && phase.targetId.startsWith("window:")) {
      const id = phase.targetId.slice(7);
      const item = getWidgetWindows().find((candidate) => candidate.id === id);
      if (!item) return;
      focusWidget(id);
      emitStudioCue("windowGrab");
      hand.current = { id, startX: item.x, startY: item.y, anchorNx: null, anchorNy: null };
      return;
    }
    if (phase.type === "grabMove" && hand.current) {
      const session = hand.current;
      if (session.anchorNx === null || session.anchorNy === null) {
        session.anchorNx = phase.nx;
        session.anchorNy = phase.ny;
        return;
      }
      const item = getWidgetWindows().find((candidate) => candidate.id === session.id);
      const element = elements.current.get(session.id);
      if (!item || !element) return;
      const rect = clampToStage({
        ...item,
        x: session.startX + phase.nx - session.anchorNx,
        y: session.startY + phase.ny - session.anchorNy,
      });
      applyWindowGeometry(element, rect);
      return;
    }
    if (phase.type === "grabEnd" && hand.current) {
      const session = hand.current;
      const cursor = session.anchorNx === null ? null : session;
      hand.current = null;
      const item = getWidgetWindows().find((candidate) => candidate.id === session.id);
      const element = elements.current.get(session.id);
      if (!cursor || !item || !element) return;
      const stage = element.parentElement?.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      if (stage?.width && stage.height) {
        moveWidget(session.id, (rect.left - stage.left + rect.width / 2) / stage.width, (rect.top - stage.top + rect.height / 2) / stage.height);
      }
    }
  });

  useStudioIntent((intent) => {
    if (intent.type !== "collapse") return;
    const target = input.getSnapshot().hoverTargetId;
    if (target?.startsWith("window:")) {
      emitStudioCue("dismiss");
      closeWidget(target.slice(7));
    }
  });

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-20">
        <AnimatePresence>
          {glints.map((glint) => (
            <motion.div
              key={`glint:${glint.id}`}
              className="absolute h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${glint.x * 100}%`,
                top: `${glint.y * 100}%`,
                background: `radial-gradient(circle, color-mix(in srgb, ${STUDIOLO.jarvisCyan} 42%, transparent), transparent 70%)`,
              }}
              initial={{ opacity: 0, scale: 0.35 }}
              animate={{ opacity: [0, 1, 0], scale: 1.35 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            />
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {windows.map((item) => (
            <WidgetWindow key={item.id} window={item} onElement={onElement} />
          ))}
        </AnimatePresence>
      </div>
      <WidgetSummonMenu />
      <StudioPushToTalk />
    </>
  );
}
