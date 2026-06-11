// Fallback text input — for moments when dictating isn't an option.
// Behaves like the browser console's text bar: type, send, response streams
// in the same conversation view.

import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, mono, serif } from "../theme";

export function TextBar({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    setValue("");
    onSubmit(text);
  };

  return (
    <View style={styles.row}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder="Type to JARVIS…"
        placeholderTextColor={colors.textDim}
        returnKeyType="send"
        submitBehavior="submit"
        autoCapitalize="sentences"
        autoCorrect
        editable={!disabled}
        multiline={false}
      />
      <Pressable
        onPress={submit}
        disabled={disabled || !value.trim()}
        style={({ pressed }) => [
          styles.send,
          (disabled || !value.trim()) && styles.sendDisabled,
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Send"
      >
        <Text style={styles.sendLabel}>↑</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 16,
    fontFamily: serif,
    fontSize: 17,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(0, 212, 255, 0.12)",
  },
  sendDisabled: {
    opacity: 0.35,
  },
  sendLabel: {
    color: colors.accent,
    fontSize: 18,
    fontFamily: mono,
  },
});
