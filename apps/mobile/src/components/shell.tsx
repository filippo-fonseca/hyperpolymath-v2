// Shared scaffolding for entity screens (Tasks / Habits / Captures):
// screen header, floating add button, modal form sheet, field primitives.
// Styled to the sd register (mirror desktop / DESIGN-SYSTEM.md).

import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { font, sd } from "../theme";

export function ScreenHeader({
  title,
  count,
  paddingTop,
  right,
}: {
  title: string;
  count?: number;
  paddingTop: number;
  right?: ReactNode;
}) {
  return (
    <View style={[styles.header, { paddingTop }]}>
      <Text style={styles.headerTitle}>{title}</Text>
      {typeof count === "number" ? <Text style={styles.headerCount}>{count}</Text> : null}
      {right ? <View style={styles.headerRight}>{right}</View> : null}
    </View>
  );
}

/** Compact mono pill used as a header accessory (e.g. "▦ projects"). */
export function HeaderButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.headerButton, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.headerButtonLabel}>{label}</Text>
    </Pressable>
  );
}

/** Single-line filter input with a clear affordance. */
export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search…",
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.searchWrap}>
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={sd.inkFaint}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={10} style={styles.searchClear}>
          <Text style={styles.searchClearLabel}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Fab({ onPress, label = "+" }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.fab, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel="Add"
    >
      <Text style={styles.fabLabel}>{label}</Text>
    </Pressable>
  );
}

export function FormSheet({
  visible,
  title,
  onClose,
  onSave,
  saveLabel = "Save",
  onDelete,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  onDelete?: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetRoot}
      >
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
          <View style={styles.sheetActions}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.buttonLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.buttonLabel, { color: sd.app }]}>{saveLabel}</Text>
            </Pressable>
          </View>
          {onDelete ? (
            <Pressable
              onPress={onDelete}
              style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.deleteLabel}>Delete</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function Field({
  value,
  onChangeText,
  placeholder,
  multiline,
  autoFocus,
  keyboardType,
  autoCapitalize,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  keyboardType?: "default" | "number-pad" | "numeric";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  style?: object;
}) {
  return (
    <TextInput
      style={[styles.input, multiline && styles.inputMultiline, style]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={sd.inkFaint}
      multiline={multiline}
      autoFocus={autoFocus}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
    />
  );
}

/** Horizontal pick-one chip row (priority, status, due presets…). */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const selected = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
              {labels?.[opt] ?? opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

/**
 * In-register failure state for a first fetch that came back empty (network
 * error, non-2xx, or timeout). Pairs a short message with an explicit Retry
 * affordance so a screen never dead-ends on an infinite spinner.
 */
export function ErrorState({
  message = "Couldn't load this. Check the server URL and sign-in in Settings.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.errorState}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel="Retry"
      >
        <Text style={styles.retryLabel}>RETRY</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 24,
    letterSpacing: -0.2,
  },
  headerCount: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 12,
  },
  headerRight: {
    marginLeft: "auto",
  },
  headerButton: {
    borderRadius: sd.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonLabel: {
    color: sd.inkDull,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  searchWrap: {
    marginHorizontal: 20,
    marginBottom: 8,
    justifyContent: "center",
  },
  searchInput: {
    height: 40,
    borderRadius: sd.radius.pillInset,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.input,
    color: sd.ink,
    paddingHorizontal: 14,
    paddingRight: 34,
    fontFamily: font.sans,
    fontSize: 15,
  },
  searchClear: {
    position: "absolute",
    right: 12,
    height: "100%",
    justifyContent: "center",
  },
  searchClearLabel: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 13,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: sd.accent,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.accent,
  },
  fabLabel: {
    color: sd.app,
    fontSize: 28,
    lineHeight: 32,
    fontFamily: font.sansMedium,
  },
  sheetRoot: {
    flex: 1,
    backgroundColor: sd.app,
  },
  sheetContent: {
    padding: 24,
    gap: 6,
  },
  sheetTitle: {
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 22,
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  sheetActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  button: {
    flex: 1,
    height: 46,
    borderRadius: sd.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: sd.accent,
    borderColor: sd.accent,
  },
  buttonLabel: {
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 14,
  },
  deleteButton: {
    marginTop: 14,
    height: 44,
    borderRadius: sd.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(224, 107, 92, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteLabel: {
    color: sd.coral,
    fontFamily: font.sansMedium,
    fontSize: 14,
  },
  fieldLabel: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.4,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    minHeight: 44,
    borderRadius: sd.radius.pillInset,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.input,
    color: sd.ink,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: font.sans,
    fontSize: 16,
  },
  inputMultiline: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: sd.radius.chip,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: {
    // Neutral selected backplate — accent only on the label (§4).
    backgroundColor: sd.selected,
    borderColor: sd.line,
  },
  chipLabel: {
    color: sd.inkDull,
    fontFamily: font.mono,
    fontSize: 12,
  },
  chipLabelSelected: {
    color: sd.accent,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: sd.inkFaint,
    fontFamily: font.sans,
    fontSize: 14,
  },
  errorState: {
    alignItems: "center",
    paddingTop: 72,
    paddingHorizontal: 30,
    gap: 8,
  },
  errorTitle: {
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 16,
  },
  errorMessage: {
    color: sd.inkFaint,
    fontFamily: font.sans,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 10,
    borderRadius: sd.radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  retryLabel: {
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.2,
  },
});
