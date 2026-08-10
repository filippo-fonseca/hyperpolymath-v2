// One word, picked per mount, with a pulsing ellipsis — Claude Code style.
// Reanimated worklets only; nothing crosses the bridge per frame.

import React, { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/theme";
import { AppText } from "@/ui";

const WORDS = [
  "Brewing", "Cogitating", "Composing", "Concocting", "Considering",
  "Contemplating", "Cooking", "Crafting", "Deciphering", "Deliberating",
  "Distilling", "Envisioning", "Fermenting", "Forging", "Harmonizing",
  "Hatching", "Ideating", "Incubating", "Inferring", "Marinating",
  "Mulling", "Musing", "Noodling", "Orchestrating", "Percolating",
  "Pondering", "Processing", "Ruminating", "Simmering", "Sketching",
  "Synthesizing", "Thinking", "Tinkering", "Weaving", "Wrangling",
] as const;

export function ThinkingWord() {
  const t = useTheme();
  const [word] = useState(() => WORDS[Math.floor(Math.random() * WORDS.length)]!);

  const fade = useSharedValue(0);
  const dots = useSharedValue(0.4);

  useEffect(() => {
    fade.value = withTiming(1, {
      duration: t.motion.duration.enter,
      easing: Easing.bezier(...t.motion.bezier.easeOutQuart),
      reduceMotion: ReduceMotion.System,
    });
    dots.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 500, reduceMotion: ReduceMotion.System }),
        withTiming(0.4, { duration: 500, reduceMotion: ReduceMotion.System }),
      ),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
  }, [fade, dots, t.motion]);

  const wordStyle = useAnimatedStyle(() => ({ opacity: fade.value }));
  const dotsStyle = useAnimatedStyle(() => ({ opacity: dots.value }));

  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
      accessibilityLiveRegion="polite"
    >
      <Animated.View style={wordStyle}>
        <AppText variant="meta" mono muted>
          {word}
        </AppText>
      </Animated.View>
      <Animated.View style={dotsStyle}>
        <AppText variant="meta" mono muted>
          …
        </AppText>
      </Animated.View>
    </View>
  );
}
