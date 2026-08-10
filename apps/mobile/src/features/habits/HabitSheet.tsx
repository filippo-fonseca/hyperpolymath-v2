import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { useHabitMutations, type Habit } from "@/data/useHabits";
import { useTheme } from "@/theme";
import { AppText, Button, Chip, Sheet } from "@/ui";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const ALL_DAYS = [true, true, true, true, true, true, true];

function Field({
  label,
  multiline,
  ...inputProps
}: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <AppText variant="micro" weight="medium" faint>
        {label}
      </AppText>
      <TextInput
        {...inputProps}
        multiline={multiline}
        placeholderTextColor={t.c.inkFaint}
        style={{
          backgroundColor: t.c.surface,
          borderColor: t.c.edge,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: t.radius.btn,
          paddingHorizontal: 12,
          paddingVertical: 10,
          minHeight: multiline ? 64 : undefined,
          textAlignVertical: multiline ? "top" : "center",
          fontFamily: t.fonts.sans,
          fontSize: t.type.body.fontSize,
          color: t.c.ink,
        }}
      />
    </View>
  );
}

export interface HabitSheetProps {
  visible: boolean;
  /** null = create mode. */
  habit: Habit | null;
  onClose: () => void;
}

/** Create/edit bottom sheet: name, description, emoji, schedule, archive, delete. */
export function HabitSheet({ visible, habit, onClose }: HabitSheetProps) {
  const t = useTheme();
  const { create, update, remove } = useHabitMutations();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [days, setDays] = useState<boolean[]>(ALL_DAYS);

  useEffect(() => {
    if (visible) {
      setName(habit?.name ?? "");
      setDescription(habit?.description ?? "");
      setIcon(habit?.icon ?? "");
      setDays(habit ? [...habit.daysOfWeek] : [...ALL_DAYS]);
    }
  }, [visible, habit]);

  const saving = create.isPending || update.isPending;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const payload = {
      name: trimmed,
      description: description.trim() || null,
      icon: icon.trim() || null,
      daysOfWeek: days,
    };
    try {
      if (habit) await update.mutateAsync({ id: habit.id, ...payload });
      else await create.mutateAsync(payload);
      onClose();
    } catch {
      Alert.alert("Couldn't save", "Check your connection and try again.");
    }
  };

  const archive = async () => {
    if (!habit) return;
    try {
      await update.mutateAsync({ id: habit.id, archived: true });
      onClose();
    } catch {
      Alert.alert("Couldn't archive", "Check your connection and try again.");
    }
  };

  const confirmDelete = () => {
    if (!habit) return;
    Alert.alert("Delete habit?", `"${habit.name}" and its history will be gone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          remove
            .mutateAsync(habit.id)
            .then(onClose)
            .catch(() =>
              Alert.alert("Couldn't delete", "Check your connection and try again."),
            );
        },
      },
    ]);
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8, gap: 14 }}>
        <AppText variant="subtitle" weight="semibold">
          {habit ? "Edit habit" : "New habit"}
        </AppText>
        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Read 20 pages"
          autoFocus={!habit}
          maxLength={120}
          returnKeyType="done"
        />
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ width: 72 }}>
            <Field
              label="Icon"
              value={icon}
              onChangeText={setIcon}
              placeholder="📖"
              maxLength={4}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Description"
              value={description}
              onChangeText={setDescription}
              placeholder="Optional"
              maxLength={500}
            />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <AppText variant="micro" weight="medium" faint>
            Days
          </AppText>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {DAY_LABELS.map((label, i) => (
              <Chip
                key={i}
                label={label}
                active={days[i] === true}
                style={{ flex: 1, justifyContent: "center", paddingHorizontal: 0 }}
                onPress={() =>
                  setDays((d) => d.map((v, j) => (j === i ? !v : v)))
                }
              />
            ))}
          </View>
        </View>
        <Button
          label={habit ? "Save changes" : "Create habit"}
          onPress={() => void save()}
          loading={saving}
          disabled={!name.trim()}
        />
        {habit ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              label="Archive"
              variant="outline"
              size="sm"
              style={{ flex: 1 }}
              onPress={() => void archive()}
            />
            <Button
              label="Delete"
              variant="destructive"
              size="sm"
              style={{ flex: 1 }}
              onPress={confirmDelete}
              loading={remove.isPending}
            />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
