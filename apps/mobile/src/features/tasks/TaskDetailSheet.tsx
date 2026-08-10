import { Trash2 } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, TextInput, View } from "react-native";

import {
  useTaskMutations,
  type Task,
  type TaskStatus,
} from "@/data/useTasks";
import { PRIORITIES, type Priority } from "@/api/device";
import { useTheme } from "@/theme";
import { AppText, Button, Chip, Sheet } from "@/ui";

import { localTodayISO, shiftISO, weekendISO } from "./sections";

const STATUS_LABELS: Record<TaskStatus, string> = {
  "not started": "Not started",
  "up next": "Up next",
  "in progress": "In progress",
  "almost done": "Almost done",
  lesno: "Lesno",
};

const STATUS_ORDER: TaskStatus[] = [
  "not started",
  "up next",
  "in progress",
  "almost done",
  "lesno",
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const TIME_PRESETS: { label: string; value: string }[] = [
  { label: "Morning", value: "09:00" },
  { label: "Noon", value: "12:00" },
  { label: "Evening", value: "18:00" },
];

function FieldLabel({ children }: { children: string }) {
  return (
    <AppText variant="micro" weight="medium" faint style={{ marginBottom: 6 }}>
      {children}
    </AppText>
  );
}

export interface TaskDetailSheetProps {
  task: Task | null;
  onClose: () => void;
}

/**
 * Edit sheet: title, notes, quick due chips, priority, the 5-rung status
 * ladder, delete. Every change saves optimistically on commit.
 */
export function TaskDetailSheet({ task, onClose }: TaskDetailSheetProps) {
  const t = useTheme();
  const { update, remove } = useTaskMutations();

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [timeText, setTimeText] = useState("");
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (task && seededFor.current !== task.id) {
      seededFor.current = task.id;
      setTitle(task.title);
      setNotes(task.notes ?? "");
    }
    if (!task) seededFor.current = null;
  }, [task]);

  // The time field mirrors the live row (chips mutate it out from under
  // the input), so it re-seeds on every cache change, not just per task.
  useEffect(() => {
    setTimeText(task?.dueTime ?? "");
  }, [task?.id, task?.dueTime]);

  const commitTime = useCallback(() => {
    if (!task) return;
    const trimmed = timeText.trim();
    if (trimmed === "") {
      if (task.dueTime !== null) update.mutate({ id: task.id, dueTime: null });
      return;
    }
    if (!TIME_RE.test(trimmed)) {
      setTimeText(task.dueTime ?? "");
      return;
    }
    if (trimmed !== task.dueTime) update.mutate({ id: task.id, dueTime: trimmed });
  }, [task, timeText, update]);

  const commitText = useCallback(() => {
    if (!task) return;
    const nextTitle = title.trim();
    const nextNotes = notes.trim();
    const patch: { id: string; title?: string; notes?: string | null } = { id: task.id };
    if (nextTitle && nextTitle !== task.title) patch.title = nextTitle;
    if (nextNotes !== (task.notes ?? "")) patch.notes = nextNotes || null;
    if (patch.title !== undefined || patch.notes !== undefined) update.mutate(patch);
  }, [task, title, notes, update]);

  const close = useCallback(() => {
    commitText();
    onClose();
  }, [commitText, onClose]);

  if (!task) return null;

  const todayISO = localTodayISO();
  const dueOptions: { label: string; value: string | null }[] = [
    { label: "Today", value: todayISO },
    { label: "Tomorrow", value: shiftISO(todayISO, 1) },
    { label: "Weekend", value: weekendISO(todayISO) },
    { label: "Clear", value: null },
  ];

  const confirmDelete = () => {
    Alert.alert("Delete task", `"${task.title}" will be gone for good.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          remove.mutate(task.id);
          onClose();
        },
      },
    ]);
  };

  const inputBase = {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.c.edge,
    borderRadius: t.radius.btn,
    backgroundColor: t.c.surface,
    paddingHorizontal: 12,
    color: t.c.ink,
  } as const;

  return (
    <Sheet visible={task !== null} onClose={close}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 16 }}
      >
        <TextInput
          value={title}
          onChangeText={setTitle}
          onEndEditing={commitText}
          placeholder="Task title"
          placeholderTextColor={t.c.inkFaint}
          multiline
          accessibilityLabel="Task title"
          style={{
            fontFamily: t.fonts.sansSemiBold,
            fontSize: t.type.subtitle.fontSize,
            lineHeight: t.type.subtitle.lineHeight,
            color: t.c.ink,
            paddingVertical: 0,
          }}
        />

        <View>
          <FieldLabel>Due</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {dueOptions.map((opt) => (
              <Chip
                key={opt.label}
                label={opt.label}
                active={task.dueDate === opt.value && opt.value !== null}
                haptic
                onPress={() =>
                  update.mutate({
                    id: task.id,
                    dueDate: opt.value,
                    // A time without a date is meaningless: clearing the
                    // date clears the time with it.
                    ...(opt.value === null ? { dueTime: null } : {}),
                  })
                }
              />
            ))}
          </View>
        </View>

        {task.dueDate !== null ? (
          <View>
            <FieldLabel>Time</FieldLabel>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
              }}
            >
              {TIME_PRESETS.map((opt) => (
                <Chip
                  key={opt.label}
                  label={opt.label}
                  active={task.dueTime === opt.value}
                  haptic
                  onPress={() =>
                    update.mutate({
                      id: task.id,
                      dueTime: task.dueTime === opt.value ? null : opt.value,
                    })
                  }
                />
              ))}
              <TextInput
                value={timeText}
                onChangeText={setTimeText}
                onEndEditing={commitTime}
                placeholder="HH:MM"
                placeholderTextColor={t.c.inkFaint}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                accessibilityLabel="Due time"
                style={[
                  inputBase,
                  {
                    fontFamily: t.fonts.mono,
                    fontSize: t.type.meta.fontSize,
                    height: 28,
                    width: 72,
                    paddingVertical: 0,
                    textAlign: "center",
                    borderRadius: 9999,
                  },
                ]}
              />
            </View>
          </View>
        ) : null}

        <View>
          <FieldLabel>Priority</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {PRIORITIES.map((p: Priority) => (
              <Chip
                key={p}
                label={p}
                active={task.priority === p}
                haptic
                onPress={() => update.mutate({ id: task.id, priority: p })}
              />
            ))}
          </View>
        </View>

        <View>
          <FieldLabel>Status</FieldLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {STATUS_ORDER.map((s) => (
              <Chip
                key={s}
                label={STATUS_LABELS[s]}
                active={task.status === s}
                haptic
                onPress={() => update.mutate({ id: task.id, status: s })}
              />
            ))}
          </View>
        </View>

        <View>
          <FieldLabel>Notes</FieldLabel>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            onEndEditing={commitText}
            placeholder="Add a note"
            placeholderTextColor={t.c.inkFaint}
            multiline
            accessibilityLabel="Notes"
            style={[
              inputBase,
              {
                fontFamily: t.fonts.sans,
                fontSize: t.type.body.fontSize,
                lineHeight: t.type.body.lineHeight,
                minHeight: 72,
                paddingTop: 10,
                paddingBottom: 10,
                textAlignVertical: "top",
              },
            ]}
          />
        </View>

        <Button
          label="Delete task"
          variant="destructive"
          size="sm"
          icon={<Trash2 size={14} color={t.c.coral} strokeWidth={2} />}
          onPress={confirmDelete}
          style={{ alignSelf: "flex-start" }}
        />
      </ScrollView>
    </Sheet>
  );
}
