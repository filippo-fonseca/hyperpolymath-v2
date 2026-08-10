import React, { useEffect } from "react";
import { type DimensionValue, type ViewProps } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/theme";

export interface SkeletonProps extends ViewProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}

/** Loading placeholder: selected-tone block with a soft opacity pulse. */
export function Skeleton({ width = "100%", height = 14, radius, style, ...rest }: SkeletonProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(withTiming(0.55, { duration: 700 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);

  const fade = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      {...rest}
      style={[
        {
          width,
          height,
          borderRadius: radius ?? t.radius.row,
          backgroundColor: t.c.selected,
        },
        fade,
        style,
      ]}
    />
  );
}

/** A standard three-line list skeleton block. */
export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton
          key={i}
          height={36}
          radius={10}
          style={{ marginBottom: 8, width: `${100 - (i % 3) * 9}%` }}
        />
      ))}
    </>
  );
}
