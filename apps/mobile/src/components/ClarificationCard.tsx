// Inline clarification — mobile twin of JarvisClarification.tsx. Renders
// when JARVIS emits ask_clarification: the question in serif, tappable
// option chips, and a hint that the text bar replies directly. Answered
// state dims the card and disables the chips.

import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, mono, serif } from "../theme";

export interface ClarificationState {
  question: string;
  options: string[];
  answered: boolean;
}

export function ClarificationCard({
  clarification,
  onReply,
}: {
  clarification: ClarificationState;
  onReply: (text: string) => void;
}) {
  const disabled = clarification.answered;
  return (
    <View style={[styles.card, disabled && styles.cardAnswered]}>
      <View style={styles.headerRow}>
        <View style={styles.dot} />
        <Text style={styles.label}>CLARIFY</Text>
        {disabled ? <Text style={styles.answered}>answered</Text> : null}
      </View>
      <Text style={styles.question}>{clarification.question}</Text>
      {clarification.options.length > 0 && (
        <View style={styles.options}>
          {clarification.options.map((opt) => (
            <Pressable
              key={opt}
              disabled={disabled}
              onPress={() => onReply(opt)}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            >
              <Text style={styles.optionText}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {!disabled ? (
        <Text style={styles.hint}>tap an option, or answer in the text bar / by voice</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: "rgba(0, 212, 255, 0.05)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  cardAnswered: {
    opacity: 0.55,
    shadowOpacity: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  label: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  answered: {
    marginLeft: "auto",
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1,
  },
  question: {
    color: colors.text,
    fontFamily: serif,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 6,
  },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  option: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(217, 160, 63, 0.45)",
    backgroundColor: "rgba(217, 160, 63, 0.10)",
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  optionPressed: {
    backgroundColor: "rgba(217, 160, 63, 0.25)",
  },
  optionText: {
    color: "#d9a03f",
    fontFamily: serif,
    fontSize: 15,
  },
  hint: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 0.5,
    marginTop: 9,
  },
});
