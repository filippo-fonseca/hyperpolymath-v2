"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { WidgetKind } from "./catalog";
import { WIDGET_CATALOG } from "./catalog";
import {
  closeAll,
  closeWidgetsByKind,
  summonWidget,
} from "../state/widget-windows";
import { emitStudioCue } from "../audio/cues";

export type StudioVoiceAction =
  | { type: "open_widget"; kind: WidgetKind; url?: string; ts: number }
  | { type: "close_widget"; kind?: WidgetKind; all?: boolean; ts: number };

export interface VoiceBridgeState {
  lastTs: number;
}

export function reduceVoiceBridgeAction(
  state: VoiceBridgeState,
  action: StudioVoiceAction,
): { state: VoiceBridgeState; action: StudioVoiceAction | null } {
  if (!Number.isFinite(action.ts) || action.ts <= state.lastTs) {
    return { state, action: null };
  }
  return { state: { lastTs: action.ts }, action };
}

function isVoiceAction(value: unknown): value is StudioVoiceAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Partial<StudioVoiceAction>;
  return (action.type === "open_widget" || action.type === "close_widget") &&
    typeof action.ts === "number";
}

export function useStudioVoiceBridge(userId: string): void {
  useEffect(() => {
    const supabase = createClient();
    let state: VoiceBridgeState = { lastTs: 0 };
    const channel = supabase
      .channel(`studio:${userId}`)
      .on("broadcast", { event: "studio_action" }, ({ payload }) => {
        if (!isVoiceAction(payload)) return;
        const reduced = reduceVoiceBridgeAction(state, payload);
        state = reduced.state;
        const action = reduced.action;
        if (!action) return;
        if (action.type === "open_widget") {
          const entry = WIDGET_CATALOG[action.kind];
          if (!entry) return;
          summonWidget(
            action.kind,
            action.kind === "browser" && action.url ? { url: action.url } : {},
            undefined,
            { defaultSize: entry.defaultSize, singleton: entry.singleton },
          );
          emitStudioCue("summon");
        } else if (action.all) {
          closeAll();
          emitStudioCue("dismiss");
        } else if (action.kind) {
          closeWidgetsByKind(action.kind);
          emitStudioCue("dismiss");
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
