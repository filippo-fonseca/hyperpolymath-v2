// Shared scaffolding for the entity screens (Tasks / Habits / Captures):
// screen header, floating add button, modal form sheet, field primitives.

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

import { colors, mono, serif, serifSemiBold } from "../theme";

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
        placeholderTextColor={colors.textDim}
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
  saveLabel = "SAVE",
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
              <Text style={styles.buttonLabel}>CANCEL</Text>
            </Pressable>
            <Pressable
              onPress={onSave}
              style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.buttonLabel, { color: colors.bg }]}>{saveLabel}</Text>
            </Pressable>
          </View>
          {onDelete ? (
            <Pressable
              onPress={onDelete}
              style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.deleteLabel}>DELETE</Text>
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
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <TextInput
      style={[styles.input, multiline && styles.inputMultiline]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textDim}
      multiline={multiline}
      autoFocus={autoFocus}
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

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    color: colors.text,
    fontFamily: serifSemiBold,
    fontSize: 26,
    letterSpacing: 0.5,
  },
  headerCount: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 13,
  },
  headerRight: {
    marginLeft: "auto",
  },
  headerButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerButtonLabel: {
    color: colors.accent,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 1,
  },
  searchWrap: {
    marginHorizontal: 20,
    marginBottom: 8,
    justifyContent: "center",
  },
  searchInput: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 14,
    paddingRight: 34,
    fontFamily: serif,
    fontSize: 15,
  },
  searchClear: {
    position: "absolute",
    right: 12,
    height: "100%",
    justifyContent: "center",
  },
  searchClearLabel: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 13,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    // Opaque cyan-on-dark mix — content scrolls underneath, and a
    // translucent fill let list rows bleed through the button.
    backgroundColor: "#08313d",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  fabLabel: {
    color: colors.accent,
    fontSize: 28,
    lineHeight: 32,
    fontFamily: mono,
  },
  sheetRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  sheetContent: {
    padding: 24,
    gap: 6,
  },
  sheetTitle: {
    color: colors.accent,
    fontFamily: serifSemiBold,
    fontSize: 22,
    letterSpacing: 1,
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  buttonLabel: {
    color: colors.text,
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 2,
  },
  deleteButton: {
    marginTop: 14,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(229, 75, 75, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteLabel: {
    color: colors.rec,
    fontFamily: mono,
    fontSize: 12,
    letterSpacing: 2,
  },
  fieldLabel: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 11,
    letterSpacing: 2,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: serif,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: "rgba(0, 212, 255, 0.12)",
  },
  chipLabel: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 12,
  },
  chipLabelSelected: {
    color: colors.accent,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: colors.textDim,
    fontFamily: serif,
    fontSize: 16,
    fontStyle: "italic",
  },
});
