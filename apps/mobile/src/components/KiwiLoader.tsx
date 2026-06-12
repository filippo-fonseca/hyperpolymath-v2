// Brand loading indicator — the KiwiMark glyph with a gentle breathe
// animation (opacity 0.35 → 1 + slight scale pulse) via the core Animated
// API. Drop-in replacement for ActivityIndicator: same size/color props,
// no third-party dependencies.

import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { colors } from "../theme";
import { KiwiMark } from "./icons";

interface KiwiLoaderProps {
  /** Diameter of the glyph (matches ActivityIndicator `size` semantics). */
  size?: number;
  /** Tint for the kiwi glyph — defaults to the app accent cyan. */
  color?: string;
}

export function KiwiLoader({ size = 28, color = colors.accent }: KiwiLoaderProps) {
  const opacity = useRef(new Animated.Value(0.35)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0.35,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.88,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    breathe.start();
    return () => breathe.stop();
  }, [opacity, scale]);

  return (
    <View style={styles.wrapper}>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <KiwiMark size={size} color={color} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
});
