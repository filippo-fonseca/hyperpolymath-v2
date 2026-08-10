import { Check } from "lucide-react-native";
import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { ladderFill, type HabitLadderStatus } from "@/data/useHabits";
import { useTheme, withAlpha, type Tint } from "@/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface HabitStatusRingProps {
  status: HabitLadderStatus;
  tint: Tint;
  /** Outer square in px. */
  size?: number;
  strokeWidth?: number;
}

/**
 * The four-rung status ring: arc fill 0 / ⅓ / ⅔ / 1 in the habit's tint,
 * check glyph when done — mirrors the web HabitStatusRing.
 */
export function HabitStatusRing({
  status,
  tint,
  size = 24,
  strokeWidth = 2.5,
}: HabitStatusRingProps) {
  const t = useTheme();
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const fill = useSharedValue(ladderFill(status));

  useEffect(() => {
    const c = t.motion.bezier.easeOutQuart;
    fill.value = withTiming(ladderFill(status), {
      duration: t.motion.duration.enter,
      easing: Easing.bezier(c[0], c[1], c[2], c[3]),
    });
  }, [status, fill, t.motion]);

  const arc = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - fill.value),
  }));

  const done = status === "done";

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg
        width={size}
        height={size}
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={withAlpha(tint.edge, 0.28)}
          strokeWidth={strokeWidth}
          fill={done ? withAlpha(tint.edge, 0.16) : "none"}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tint.edge}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={arc}
        />
      </Svg>
      {done ? (
        <View style={{ position: "absolute" }}>
          <Check size={size * 0.5} color={tint.edge} strokeWidth={3} />
        </View>
      ) : null}
    </View>
  );
}
