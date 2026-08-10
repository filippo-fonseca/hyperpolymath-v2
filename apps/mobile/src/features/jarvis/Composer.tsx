// Bottom-pinned craft-pill composer. Mic when empty, send when typed, stop
// while a turn is in flight. The draft is controlled here (parent passes an
// optional prefill through a ref-ish prop) so keystrokes never touch the
// transcript tree.

import React, { forwardRef, useImperativeHandle, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  ReduceMotion,
  ZoomIn,
} from "react-native-reanimated";
import { ArrowUp, Mic, Square } from "lucide-react-native";

import { useTheme } from "@/theme";
import { PressableRow } from "@/ui";

export interface ComposerHandle {
  prefill: (text: string) => void;
}

export interface ComposerProps {
  busy: boolean;
  onSend: (text: string) => void;
  onMic: () => void;
  onStop: () => void;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { busy, onSend, onMic, onStop },
  ref,
) {
  const t = useTheme();
  const [draft, setDraft] = useState("");
  const hasText = draft.trim().length > 0;

  useImperativeHandle(ref, () => ({
    prefill: (text: string) => setDraft(text),
  }));

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onSend(text);
  };

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: t.c.surfaceRaised,
          borderColor: t.c.edge,
          borderRadius: t.radius.pill,
          ...t.shadow.card,
        },
      ]}
    >
      <PressableRow
        accessibilityRole="button"
        accessibilityLabel="Talk to JARVIS"
        haptic
        onPress={onMic}
        style={[styles.iconBtn, { borderRadius: t.radius.pill }]}
      >
        <Mic size={19} color={t.c.inkMuted} strokeWidth={1.8} />
      </PressableRow>

      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder="Ask JARVIS anything…"
        placeholderTextColor={t.c.inkFaint}
        multiline
        style={[
          styles.input,
          {
            color: t.c.ink,
            fontFamily: t.fonts.sans,
            fontSize: t.type.body.fontSize,
            lineHeight: t.type.body.lineHeight,
          },
        ]}
        onSubmitEditing={send}
        submitBehavior="submit"
        returnKeyType="send"
        accessibilityLabel="Message JARVIS"
      />

      {busy ? (
        <Animated.View
          entering={ZoomIn.duration(t.motion.duration.micro).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(t.motion.duration.micro).reduceMotion(ReduceMotion.System)}
        >
          <PressableRow
            accessibilityRole="button"
            accessibilityLabel="Stop"
            haptic
            onPress={onStop}
            style={[styles.action, { backgroundColor: t.c.coral, borderRadius: t.radius.pill }]}
          >
            <Square size={13} color={t.c.surfaceRaised} fill={t.c.surfaceRaised} />
          </PressableRow>
        </Animated.View>
      ) : hasText ? (
        <Animated.View
          entering={ZoomIn.duration(t.motion.duration.micro).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(t.motion.duration.micro).reduceMotion(ReduceMotion.System)}
        >
          <PressableRow
            accessibilityRole="button"
            accessibilityLabel="Send"
            haptic
            onPress={send}
            style={[styles.action, { backgroundColor: t.c.accent, borderRadius: t.radius.pill }]}
          >
            <ArrowUp size={17} color={t.c.surfaceRaised} strokeWidth={2.2} />
          </PressableRow>
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeIn.duration(t.motion.duration.micro).reduceMotion(ReduceMotion.System)}
          style={styles.action}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingVertical: 5,
    gap: 4,
  },
  iconBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    maxHeight: 96,
    paddingTop: 7,
    paddingBottom: 7,
    paddingHorizontal: 2,
  },
  action: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
});
