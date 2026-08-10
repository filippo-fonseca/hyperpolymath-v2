import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/theme";

export interface FABProps {
  onPress: () => void;
  icon: React.ReactNode;
  accessibilityLabel: string;
  /** Distance from the bottom edge (above the tab bar). */
  bottom?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Accent floating action button, bottom-right, press-scale 4%. */
export function FAB({ onPress, icon, accessibilityLabel, bottom = 24 }: FABProps) {
  const t = useTheme();
  const pressed = useSharedValue(0);

  const scale = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * 0.04 }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onPressIn={() => {
        pressed.value = withTiming(1, { duration: t.motion.duration.press });
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, { duration: t.motion.duration.micro });
      }}
      style={[
        {
          position: "absolute",
          right: 16,
          bottom,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: t.c.accent,
          alignItems: "center",
          justifyContent: "center",
          ...t.shadow.float,
        },
        scale,
      ]}
    >
      {icon}
    </AnimatedPressable>
  );
}
