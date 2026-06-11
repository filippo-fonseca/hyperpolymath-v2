// Full-screen dictation overlay. Opens when the orb is tapped: dark scrim
// over the conversation, the orb large and centered in its active state, a
// hint label, and a cancel button to discard the capture without sending.
// Tap the orb again to send; cancel or send collapses back to the screen.

import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text } from "react-native";

import { colors, mono } from "../theme";
import { Orb, type OrbState } from "./Orb";

export function VoiceOverlay({
  visible,
  state,
  onOrbPress,
  onCancel,
}: {
  visible: boolean;
  state: OrbState;
  onOrbPress: () => void;
  onCancel: () => void;
}) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 140,
      useNativeDriver: true,
    }).start();
  }, [visible, fade]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.root, { opacity: fade }]}>
      <Text style={styles.title}>
        {state === "recording" ? "LISTENING" : state === "transcribing" ? "SENDING" : "JARVIS"}
      </Text>
      <Orb state={state} size={300} onPress={onOrbPress} />
      <Text style={styles.hint}>
        {state === "recording" ? "tap the orb to send" : "one moment…"}
      </Text>
      <Pressable
        onPress={onCancel}
        hitSlop={10}
        style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel="Cancel dictation"
      >
        <Text style={styles.cancelLabel}>CANCEL</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(3, 7, 10, 0.97)",
    alignItems: "center",
    justifyContent: "center",
    gap: 28,
    zIndex: 100,
  },
  title: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 6,
  },
  hint: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 2,
  },
  cancel: {
    marginTop: 12,
    paddingHorizontal: 28,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(229, 75, 75, 0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelLabel: {
    color: colors.rec,
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 3,
  },
});
