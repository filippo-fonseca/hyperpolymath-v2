// Imperative toast: one floating pill above the tab bar. Module-level
// `toast(message)` so feature code never threads a context just to say
// "Lesno." — the single ToastHost mounted in the root layout renders it.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown, FadeOut, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme";

import { AppText } from "./AppText";

interface ToastState {
  message: string;
  /** Bumped per show so a repeat message still re-enters. */
  key: number;
}

const DISMISS_MS = 1800;

let show: ((message: string) => void) | null = null;

/** Show a transient toast. Safe to call anywhere; no-op before the host mounts. */
export function toast(message: string): void {
  show?.(message);
}

export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const present = useCallback((message: string) => {
    setState((prev) => ({ message, key: (prev?.key ?? 0) + 1 }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState(null), DISMISS_MS);
  }, []);

  useEffect(() => {
    show = present;
    return () => {
      show = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [present]);

  if (!state) return null;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { justifyContent: "flex-end", alignItems: "center" }]}
    >
      <Animated.View
        key={state.key}
        entering={FadeInDown.duration(160).reduceMotion(ReduceMotion.System)}
        exiting={FadeOut.duration(t.motion.duration.micro).reduceMotion(ReduceMotion.System)}
        style={{
          marginBottom: insets.bottom + 76,
          backgroundColor: t.c.surfaceRaised,
          borderColor: t.c.edge,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: t.radius.pill,
          paddingHorizontal: 16,
          paddingVertical: 8,
          ...t.shadow.float,
        }}
      >
        <AppText variant="meta" weight="medium">
          {state.message}
        </AppText>
      </Animated.View>
    </View>
  );
}
