import { Bell, CalendarDays, Trash2 } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, TextInput, View } from "react-native";

import {
  useTaskMutations,
  type Task,
  type TaskStatus,
} from "@/data/useTasks";
import { PRIORITIES, type Priority } from "@/api/device";
import { useTheme } from "@/theme";
import { AppText, Button, Chip, PressableRow, Sheet } from "@/ui";

import { DueDatePicker } from "./DueDatePicker";
import { dayLabel, localTodayISO, shiftISO } from "./sections";

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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Today" / "Tomorrow" / "Fri, Aug 14" from a YMD string, no UTC drift. */
function dueDayLabel(dueDate: string, todayISO: string): string {
  if (dueDate === todayISO) return "Today";
  if (dueDate === shiftISO(todayISO, 1)) return "Tomorrow";
  const [y, m, d] = dueDate.split("-").map(Number);
  const dow = new Date(y!, (m ?? 1) - 1, d ?? 1).getDay();
  return `${WEEKDAYS[dow]}, ${dayLabel(dueDate)}`;
}

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (task && seededFor.current !== task.id) {
      seededFor.current = task.id;
      setTitle(task.title);
      setNotes(task.notes ?? "");
      setPickerOpen(false);
    }
    if (!task) seededFor.current = null;
  }, [task]);

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
  const reminderCount = task.reminderOffsetsMin.length;

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
          <PressableRow
            haptic
            accessibilityRole="button"
            accessibilityLabel="Set due date"
            onPress={() => setPickerOpen(true)}
            style={[
              inputBase,
              {
                height: 44,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              },
            ]}
          >
            <CalendarDays
              size={16}
              color={task.dueDate ? t.c.ink : t.c.inkFaint}
              strokeWidth={2}
            />
            {task.dueDate ? (
              <>
                <AppText variant="body">
                  {dueDayLabel(task.dueDate, todayISO)}
                </AppText>
                {task.dueTime ? (
                  <AppText variant="meta" mono muted>
                    {task.dueTime}
                  </AppText>
                ) : null}
                {reminderCount > 0 ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 3,
                      marginLeft: "auto",
                    }}
                  >
                    <Bell size={13} color={t.c.inkMuted} strokeWidth={2} />
                    <AppText variant="micro" mono muted>
                      {String(reminderCount)}
                    </AppText>
                  </View>
                ) : null}
              </>
            ) : (
              <AppText variant="body" faint>
                Set due date
              </AppText>
            )}
          </PressableRow>
        </View>

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

      {/* Nested modal: stacks above this sheet on iOS because it renders
          inside the presented Modal's tree. */}
      <DueDatePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={{
          dueDate: task.dueDate,
          dueTime: task.dueTime,
          reminderOffsetsMin: task.reminderOffsetsMin,
        }}
        onChange={(patch) => update.mutate({ id: task.id, ...patch })}
      />
    </Sheet>
  );
}
