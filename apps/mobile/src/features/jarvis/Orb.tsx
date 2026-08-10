// The JARVIS orb — v1's concentric tick rings, rebuilt on Reanimated so
// every frame stays on the UI thread. Idle breathes ≤4%; listening pulses a
// touch quicker; thinking slowly rotates the tick ring; speaking pulses the
// core's opacity. One whisper of accent, no glow rings.

import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { useTheme, withAlpha } from "@/theme";

import type { OrbState } from "./useJarvisEngine";

export function Orb({ state, size = 120 }: { state: OrbState; size?: number }) {
  const t = useTheme();
  const breath = useSharedValue(1);
  const spin = useSharedValue(0);
  const core = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(breath);
    cancelAnimation(spin);
    cancelAnimation(core);
    core.value = withTiming(1, { duration: t.motion.duration.micro });

    if (state === "idle") {
      breath.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
        undefined,
        ReduceMotion.System,
      );
    } else if (state === "listening") {
      breath.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 620, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
        undefined,
        ReduceMotion.System,
      );
    } else {
      breath.value = withTiming(1, { duration: t.motion.duration.enter });
    }

    if (state === "thinking") {
      spin.value = withRepeat(
        withTiming(spin.value + 360, { duration: 8000, easing: Easing.linear }),
        -1,
        false,
        undefined,
        ReduceMotion.System,
      );
    }

    if (state === "speaking") {
      core.value = withRepeat(
        withSequence(
          withTiming(0.55, { duration: 420, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 420, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
        undefined,
        ReduceMotion.System,
      );
    }
  }, [state, breath, spin, core, t.motion]);

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));
  const coreStyle = useAnimatedStyle(() => ({ opacity: core.value }));

  const s = size;
  const c = s / 2;
  const tickR = c - 2;
  const midR = c * 0.72;
  const coreR = c * 0.42;
  const accent = t.c.accent;

  return (
    <Animated.View style={[{ width: s, height: s }, wrapStyle]}>
      {/* Tick ring — rotates while thinking. */}
      <Animated.View style={[StyleSheet.absoluteFill, spinStyle]}>
        <Svg width={s} height={s}>
          <Circle
            cx={c}
            cy={c}
            r={tickR}
            stroke={withAlpha(accent, 0.5)}
            strokeWidth={1.5}
            strokeDasharray={`2 ${(2 * Math.PI * tickR) / 48 - 2}`}
            fill="none"
          />
        </Svg>
      </Animated.View>
      {/* Middle hairline ring. */}
      <View style={StyleSheet.absoluteFill}>
        <Svg width={s} height={s}>
          <Circle
            cx={c}
            cy={c}
            r={midR}
            stroke={t.c.edgeStrong}
            strokeWidth={StyleSheet.hairlineWidth * 2}
            fill="none"
          />
        </Svg>
      </View>
      {/* Core. */}
      <Animated.View style={[StyleSheet.absoluteFill, coreStyle]}>
        <Svg width={s} height={s}>
          <Circle cx={c} cy={c} r={coreR} fill={withAlpha(accent, 0.14)} />
          <Circle cx={c} cy={c} r={coreR * 0.32} fill={withAlpha(accent, 0.85)} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}
