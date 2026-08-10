import * as Haptics from "expo-haptics";
import { ArrowUp } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme, withAlpha } from "@/theme";
import { PressableRow } from "@/ui";

export interface CaptureComposerProps {
  onSubmit: (content: string) => void;
  /** Focus the input imperatively (widget deep-link ?compose=1). */
  inputRef?: React.RefObject<TextInput | null>;
}

/**
 * Pinned quick-capture input in the craft-pill grammar: raised pill,
 * hairline edge that firms on focus, send affordance only when there's
 * something to send. Submit clears instantly — the optimistic insert
 * carries the feedback.
 */
export function CaptureComposer({ onSubmit, inputRef }: CaptureComposerProps) {
  const t = useTheme();
  const [value, setValue] = useState("");
  const focused = useSharedValue(0);

  const hasText = value.trim().length > 0;

  const frame = useAnimatedStyle(() => ({
    borderColor: withTiming(focused.value ? t.c.edgeStrong : t.c.edge, {
      duration: t.motion.duration.micro,
    }),
  }));

  const submit = useCallback(() => {
    const content = value.trim();
    if (!content) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setValue("");
    onSubmit(content);
  }, [value, onSubmit]);

  return (
    <Animated.View
      style={[
        {
          flexDirection: "row",
          alignItems: "flex-end",
          backgroundColor: t.c.surfaceRaised,
          borderRadius: 22,
          borderWidth: StyleSheet.hairlineWidth,
          paddingLeft: 16,
          paddingRight: 6,
          paddingVertical: 6,
          minHeight: 44,
          ...t.shadow.card,
        },
        frame,
      ]}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={setValue}
        placeholder="Capture a thought…"
        placeholderTextColor={t.c.inkFaint}
        multiline
        maxLength={2000}
        onFocus={() => {
          focused.value = 1;
        }}
        onBlur={() => {
          focused.value = 0;
        }}
        style={{
          flex: 1,
          fontFamily: t.fonts.sans,
          fontSize: t.type.body.fontSize,
          lineHeight: t.type.body.lineHeight,
          color: t.c.ink,
          maxHeight: 4 * t.type.body.lineHeight + 12,
          paddingTop: 6,
          paddingBottom: 6,
        }}
        accessibilityLabel="Capture a thought"
      />
      {hasText ? (
        <Animated.View
          entering={FadeIn.duration(t.motion.duration.micro)}
          exiting={FadeOut.duration(t.motion.duration.micro)}
        >
          <PressableRow
            onPress={submit}
            pressColor={withAlpha(t.c.accent, 0.85)}
            accessibilityRole="button"
            accessibilityLabel="Save capture"
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: t.c.accent,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 0,
            }}
          >
            <ArrowUp
              size={17}
              color={t.scheme === "dark" ? t.c.canvas : "#ffffff"}
              strokeWidth={2.4}
            />
          </PressableRow>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
