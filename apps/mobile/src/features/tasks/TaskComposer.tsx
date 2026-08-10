import * as Haptics from "expo-haptics";
import { Plus } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { useTheme } from "@/theme";

export interface TaskComposerProps {
  onSubmit: (title: string) => void;
}

/**
 * Ghost composer row pinned above the list: borderless until focused,
 * Enter creates and keeps the keyboard up for rapid entry.
 */
export function TaskComposer({ onSubmit }: TaskComposerProps) {
  const t = useTheme();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const submit = useCallback(() => {
    const title = text.trim();
    if (!title) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSubmit(title);
    setText("");
  }, [text, onSubmit]);

  return (
    <View
      style={{
        height: 40,
        borderRadius: t.radius.btn,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: focused ? t.c.edge : "transparent",
        backgroundColor: focused ? t.c.surfaceRaised : "transparent",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 10,
        marginTop: 6,
      }}
    >
      <Plus size={16} color={t.c.inkFaint} strokeWidth={2} />
      <TextInput
        value={text}
        onChangeText={setText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={submit}
        submitBehavior="submit"
        returnKeyType="done"
        placeholder="New task"
        placeholderTextColor={t.c.inkFaint}
        accessibilityLabel="New task"
        style={{
          flex: 1,
          fontFamily: t.fonts.sans,
          fontSize: t.type.body.fontSize,
          color: t.c.ink,
          paddingVertical: 0,
        }}
      />
    </View>
  );
}
