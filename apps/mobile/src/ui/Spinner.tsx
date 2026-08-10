import React, { useEffect } from "react";
import { View, type ViewProps } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/theme";

export interface SpinnerProps extends ViewProps {
  size?: "sm" | "md" | "lg";
  color?: string;
}

const SIZES = { sm: 16, md: 22, lg: 30 } as const;

/** Quiet ring spinner: hairline track with an accent arc, 900ms linear. */
export function Spinner({ size = "md", color, style, ...rest }: SpinnerProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);
  const px = SIZES[size];
  const stroke = size === "sm" ? 1.5 : 2;

  useEffect(() => {
    if (reduced) return;
    turn.value = withRepeat(
      withTiming(360, { duration: 900, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(turn);
  }, [reduced, turn]);

  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.value}deg` }],
  }));

  return (
    <View {...rest} style={[{ width: px, height: px }, style]}>
      <Animated.View
        style={[
          {
            width: px,
            height: px,
            borderRadius: px / 2,
            borderWidth: stroke,
            borderColor: t.c.edge,
            borderTopColor: color ?? t.c.accent,
            opacity: reduced ? 0.7 : 1,
          },
          spin,
        ]}
      />
    </View>
  );
}
