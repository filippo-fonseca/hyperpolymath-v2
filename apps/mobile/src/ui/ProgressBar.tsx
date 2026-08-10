import React, { useEffect } from "react";
import { View, type ViewProps } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/theme";

export interface ProgressBarProps extends ViewProps {
  /** 0..1 */
  ratio: number;
  color?: string;
  height?: number;
}

/** Ratio bar animated with scaleX (never width) per the motion law. */
export function ProgressBar({ ratio, color, height = 4, style, ...rest }: ProgressBarProps) {
  const t = useTheme();
  const progress = useSharedValue(Math.max(0, Math.min(1, ratio)));

  useEffect(() => {
    const c = t.motion.bezier.easeOutQuart;
    progress.value = withTiming(Math.max(0, Math.min(1, ratio)), {
      duration: t.motion.duration.enter,
      easing: Easing.bezier(c[0], c[1], c[2], c[3]),
    });
  }, [ratio, progress, t.motion]);

  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
  }));

  return (
    <View
      {...rest}
      accessibilityRole="progressbar"
      style={[
        {
          height,
          borderRadius: height / 2,
          backgroundColor: t.c.selected,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          {
            flex: 1,
            borderRadius: height / 2,
            backgroundColor: color ?? t.c.accent,
            transformOrigin: "left",
          },
          fill,
        ]}
      />
    </View>
  );
}
