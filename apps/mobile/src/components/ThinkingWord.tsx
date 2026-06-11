// v1 signature thinking-word indicator — mobile port of
// apps/web/components/jarvis/ThinkingWord.tsx. Cycles the curated word list
// every 600ms with a small fade/slide while waiting for the first chunk.

import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { colors, mono } from "../theme";

const WORDS = [
  "thinking",
  "considering",
  "parsing",
  "routing",
  "checking",
  "polishing",
  "annotating",
  "noting",
  "scheduling",
  "indexing",
  "jarvis-ing",
] as const;

const INTERVAL_MS = 600;

export function ThinkingWord() {
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;
  const dots = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const t = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 90, useNativeDriver: true }).start(() => {
        setIndex((i) => (i + 1) % WORDS.length);
        Animated.timing(fade, { toValue: 1, duration: 140, useNativeDriver: true }).start();
      });
    }, INTERVAL_MS);
    return () => clearInterval(t);
  }, [fade]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dots, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(dots, { toValue: 0.4, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dots]);

  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Animated.Text style={[styles.word, { opacity: fade }]}>{WORDS[index]}</Animated.Text>
      <Animated.View style={{ opacity: dots }}>
        <Text style={styles.word}>…</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  word: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 13,
    letterSpacing: 1,
  },
});
