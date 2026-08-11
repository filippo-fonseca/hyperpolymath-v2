import * as Haptics from "expo-haptics";
import { Plus, SlidersHorizontal } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { useTheme } from "@/theme";

export interface TaskComposerProps {
  onSubmit: (title: string) => void;
  /** Open the full creation sheet, seeded with the current draft. */
  onExpand?: (draft: string) => void;
}

/**
 * Ghost composer row pinned above the list: borderless until focused,
 * Enter creates and keeps the keyboard up for rapid entry. The trailing
 * sliders button expands into the full creation sheet (web parity with
 * TaskCreateInline handing off to the detail panel).
 */
export function TaskComposer({ onSubmit, onExpand }: TaskComposerProps) {
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

  const expand = useCallback(() => {
    void Haptics.selectionAsync();
    onExpand?.(text.trim());
    setText("");
  }, [text, onExpand]);

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
      {onExpand ? (
        <Pressable
          onPress={expand}
          accessibilityRole="button"
          accessibilityLabel="More options"
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 2 })}
        >
          <SlidersHorizontal size={15} color={t.c.inkFaint} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}
