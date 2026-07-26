// The central Shazam-style JARVIS orb — mobile twin of the desktop kiwi-orb
// (apps/desktop/index.html) and the web HudCoreBubble. Concentric tick ring +
// hairline circle + breathing radial glow + kiwi glyph, with state-driven
// color and tempo: idle/thinking/speaking cyan, recording red,
// transcribing amber.

import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";

import { serifSemiBold } from "../theme";

import { colors } from "../theme";

export type OrbState = "idle" | "recording" | "transcribing" | "thinking" | "speaking";

// Kiwi-bird silhouette from apps/desktop/index.html (.kiwi-glyph).
export const KIWI_PATH =
  "m20.741,5.991c.21-.595.299-1.234.243-1.88-.114-1.326-.812-2.532-1.913-3.309-1.422-1.002-3.378-1.072-4.87-.174-.307.185-.59.403-.841.647-.807.786-2.119,1.723-3.788,1.723h-.794C4.18,2.998.334,6.462.022,10.884c-.174,2.468.725,4.883,2.468,6.625.844.844,1.848,1.484,2.938,1.906l.573,4.583h2.191l-.499-4.04c.271.026.544.04.818.04.201,0,.403-.007.604-.021.447-.032.881-.108,1.305-.209l.529,4.231h2.168l-.706-4.987c2.729-1.469,4.589-4.425,4.589-7.791l.021-2.262c.615-.069,1.187-.271,1.708-.568,3.845,3.229,4.272,8.608,4.272,8.608h1c0-5.446-2.104-9.299-3.259-11.007Zm-3.943.98c-1.025.115-1.798.952-1.798,1.947v2.302c0,3.553-2.647,6.523-6.026,6.761-1.891.131-3.737-.555-5.07-1.887-1.333-1.333-2.021-3.181-1.887-5.071.238-3.379,3.208-6.026,6.761-6.026h.794c1.852,0,3.645-.792,5.183-2.29.141-.137.301-.261.477-.366.823-.495,1.901-.458,2.686.095.627.442,1.008,1.098,1.073,1.846.063.737-.2,1.46-.723,1.983-.398.398-.907.642-1.47.705Zm1.202-2.473c0,.828-.672,1.5-1.5,1.5s-1.5-.672-1.5-1.5.672-1.5,1.5-1.5,1.5.672,1.5,1.5Z";

const STATE_COLOR: Record<OrbState, string> = {
  idle: colors.accent,
  recording: colors.rec,
  transcribing: colors.upload,
  thinking: colors.accent,
  speaking: colors.accent,
};

// Breathing tempo per state (ms per cycle). Idle is snappier than the old
// 3.2s so the bounce reads as alive; active states stay urgent.
const STATE_BREATHE_MS: Record<OrbState, number> = {
  idle: 2400,
  recording: 900,
  transcribing: 1100,
  thinking: 1050,
  speaking: 1300,
};

const TICK_COUNT = 24;

export function Orb({
  state,
  size = 240,
  showH = false,
  onPress,
}: {
  state: OrbState;
  size?: number;
  /** Render the Hyperpolymath "H" brand mark instead of the kiwi glyph. */
  showH?: boolean;
  /** Omit to render as a pure indicator (non-pressable loader). */
  onPress?: () => void;
}) {
  const color = STATE_COLOR[state];
  const breathe = useRef(new Animated.Value(0)).current;
  const spinSlow = useRef(new Animated.Value(0)).current;
  const spinFast = useRef(new Animated.Value(0)).current;

  // Slow outer tick-ring rotation — always on.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spinSlow, {
        toValue: 1,
        duration: 24_000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spinSlow]);

  // Middle ring spins fast while JARVIS is working.
  useEffect(() => {
    const active = state === "thinking" || state === "transcribing" || state === "speaking";
    if (!active) {
      spinFast.stopAnimation();
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spinFast, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [state, spinFast]);

  // Breathing glow, tempo per state.
  useEffect(() => {
    breathe.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: STATE_BREATHE_MS[state] / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: STATE_BREATHE_MS[state] / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state, breathe]);

  const slowRotate = spinSlow.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const fastRotate = spinFast.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-360deg"] });
  // Pronounced bounce: glow blooms farther, orb expands, slight vertical travel.
  const glowScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.22] });
  const glowOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const glyphScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] });
  const bobY = breathe.interpolate({ inputRange: [0, 1], outputRange: [-10, 10] });

  // All ring geometry is proportional to the radius so the orb scales from
  // 300px (overlay) down to 48px (header) without the rings crowding the
  // glyph (absolute pixel insets collide below ~80px).
  const c = size / 2;
  const hairlineR = c * 0.85;
  const dashedR = c * 0.74;
  const ticks = useMemo(() => {
    const r = c - 1;
    return Array.from({ length: TICK_COUNT }, (_, i) => {
      const angle = (i / TICK_COUNT) * Math.PI * 2;
      const inner = r - r * (i % 2 === 0 ? 0.075 : 0.042);
      return {
        x1: c + Math.cos(angle) * inner,
        y1: c + Math.sin(angle) * inner,
        x2: c + Math.cos(angle) * r,
        y2: c + Math.sin(angle) * r,
        key: i,
      };
    });
  }, [c]);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={12}
      style={({ pressed }) => [styles.root, { width: size, height: size }, pressed && !!onPress && styles.pressed]}
      accessibilityRole={onPress ? "button" : "image"}
      accessibilityLabel={
        onPress ? (state === "recording" ? "Stop dictating" : "Dictate to JARVIS") : "JARVIS status"
      }
    >
      {/* Breathing radial glow — blooms + rides the vertical bob. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ translateY: bobY }, { scale: glowScale }], opacity: glowOpacity },
        ]}
        pointerEvents="none"
      >
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={color} stopOpacity={0.62} />
              <Stop offset="32%" stopColor={color} stopOpacity={0.28} />
              <Stop offset="58%" stopColor={color} stopOpacity={0.1} />
              <Stop offset="78%" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={c} cy={c} r={c} fill="url(#glow)" />
        </Svg>
      </Animated.View>

      {/* Outer tick ring — slow rotation */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ rotate: slowRotate }] }]}
        pointerEvents="none"
      >
        <Svg width={size} height={size}>
          <G stroke={color} strokeOpacity={0.45} strokeWidth={1.4}>
            {ticks.map((t) => (
              <Line key={t.key} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
            ))}
          </G>
        </Svg>
      </Animated.View>

      {/* Hairline circle */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={size} height={size}>
          <Circle
            cx={c}
            cy={c}
            r={hairlineR}
            stroke={color}
            strokeOpacity={0.28}
            strokeWidth={1}
            fill="none"
          />
        </Svg>
      </View>

      {/* Middle dashed ring — fast counter-rotation while working */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ rotate: fastRotate }] }]}
        pointerEvents="none"
      >
        <Svg width={size} height={size}>
          <Circle
            cx={c}
            cy={c}
            r={dashedR}
            stroke={color}
            strokeOpacity={0.55}
            strokeWidth={1.6}
            strokeDasharray={`${dashedR * 0.9} ${dashedR * 1.4}`}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Animated.View>

      {/* Logo glyph — kiwi (default) or Hyperpolymath "H" brand mark.
          Bob + scale ride the same breathe so the whole orb feels elastic. */}
      <Animated.View
        style={{ transform: [{ translateY: bobY }, { scale: glyphScale }] }}
        pointerEvents="none"
      >
        {showH ? (
          <Text
            style={{
              color: "#ffffff",
              fontFamily: serifSemiBold,
              fontSize: size * 0.38,
              lineHeight: size * 0.42,
              includeFontPadding: false,
            }}
            allowFontScaling={false}
          >
            H
          </Text>
        ) : (
          <Svg width={size * 0.3} height={size * 0.3} viewBox="0 0 24 24">
            <Path d={KIWI_PATH} fill={color} />
          </Svg>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.82,
  },
});
