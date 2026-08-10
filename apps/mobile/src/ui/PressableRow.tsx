import * as Haptics from "expo-haptics";
import React, { useCallback } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme, withAlpha } from "@/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressableRowProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  /** Background that fades in while pressed (defaults to theme hover). */
  pressColor?: string;
  /** Fire a light haptic on press. */
  haptic?: boolean;
  children?: React.ReactNode;
}

/**
 * Press feedback per the motion law: background/opacity over ~100ms,
 * no scale. The base for rows, tiles, and chips.
 */
export function PressableRow({
  style,
  pressColor,
  haptic = false,
  onPressIn,
  onPressOut,
  onPress,
  children,
  ...rest
}: PressableRowProps) {
  const t = useTheme();
  const pressed = useSharedValue(0);
  const bg = pressColor ?? t.c.hover;

  const bgFrom = withAlpha(bg, 0);
  const animated = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(pressed.value, [0, 1], [bgFrom, bg]),
    opacity: 1 - pressed.value * 0.08,
  }));

  const handlePress = useCallback(
    (e: Parameters<NonNullable<PressableProps["onPress"]>>[0]) => {
      if (haptic) void Haptics.selectionAsync();
      onPress?.(e);
    },
    [haptic, onPress],
  );

  return (
    <AnimatedPressable
      {...rest}
      onPress={handlePress}
      onPressIn={(e) => {
        pressed.value = withTiming(1, { duration: t.motion.duration.press });
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withTiming(0, { duration: t.motion.duration.micro });
        onPressOut?.(e);
      }}
      style={[animated, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
