// Full-screen listening overlay: dimmed canvas, the orb, the live interim
// transcript, and explicit affordances — tap the sheet to send, Cancel to
// discard. Level "waveform" is three staggered pulse bars (the STT module
// exposes no metering; motion implies liveness without faking data).

import React, { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useTheme, withAlpha } from "@/theme";
import { AppText, Button } from "@/ui";

import { Orb } from "./Orb";

function PulseBar({ delay }: { delay: number }) {
  const t = useTheme();
  const v = useSharedValue(0.35);
  useEffect(() => {
    v.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 380, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.35, { duration: 380, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
        undefined,
        ReduceMotion.System,
      ),
    );
  }, [v, delay]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: v.value }],
    opacity: 0.4 + 0.6 * v.value,
  }));
  return (
    <Animated.View
      style={[{ width: 3, height: 18, borderRadius: 2, backgroundColor: t.c.accent }, style]}
    />
  );
}

export function VoiceOverlay({
  interim,
  uploading,
  onSend,
  onCancel,
}: {
  interim: string;
  uploading: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  return (
    <Animated.View
      entering={FadeIn.duration(t.motion.duration.enter).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(t.motion.duration.micro).reduceMotion(ReduceMotion.System)}
      style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(t.c.canvas, 0.96) }]}
    >
      <Pressable
        style={styles.fill}
        onPress={uploading ? undefined : onSend}
        accessibilityRole="button"
        accessibilityLabel="Stop listening and send"
      >
        <View style={styles.center}>
          <Orb state="listening" size={140} />
          <View style={styles.bars}>
            <PulseBar delay={0} />
            <PulseBar delay={120} />
            <PulseBar delay={240} />
          </View>
          <AppText
            variant="subtitle"
            style={{ textAlign: "center", paddingHorizontal: 32 }}
            numberOfLines={4}
          >
            {interim || " "}
          </AppText>
          <AppText variant="micro" mono faint>
            {uploading ? "Sending…" : "Tap anywhere to send"}
          </AppText>
        </View>
        <View style={styles.footer}>
          <Button label="Cancel" variant="ghost" onPress={onCancel} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  bars: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    height: 20,
  },
  footer: {
    alignItems: "center",
    paddingBottom: 28,
  },
});
