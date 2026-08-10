// Action receipt — inset sub-card with a 6px intent dot, sentence-case mono
// label, resolved summary, and a 5s undo affordance. Craft grammar: one
// colored element (the dot), dates/status as bare text, no uppercase.

import React, { memo, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/theme";
import { AppText, PressableRow } from "@/ui";

import { actionResult, type ReceiptAction } from "./types";

const UNDO_WINDOW_S = 5;

function intentLabel(name: string): string {
  const map: Record<string, string> = {
    create_task: "Task",
    create_capture: "Capture",
    create_event: "Event",
    update_task: "Update task",
    update_capture: "Update capture",
    update_event: "Update event",
    delete_task: "Delete task",
    delete_capture: "Delete capture",
    delete_event: "Delete event",
    find_tasks: "Find tasks",
    find_captures: "Find captures",
    find_events: "Find events",
    remember_fact: "Memory",
    ask_clarification: "Question",
    complete_habit: "Habit",
  };
  if (map[name]) return map[name];
  const words = name.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function summaryOf(action: ReceiptAction): string {
  const result = actionResult(action);
  if (result.error) return result.error;
  const receipt = result.receipt ?? {};
  for (const key of ["title", "content", "summary", "name", "text", "fact"]) {
    const v = receipt[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return result.ok ? "Done" : "Failed";
}

function UndoCountdown({ onUndo }: { onUndo: () => void }) {
  const t = useTheme();
  const [seconds, setSeconds] = useState(UNDO_WINDOW_S);
  const [hidden, setHidden] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(timer);
          setHidden(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (hidden) return null;
  return (
    <PressableRow
      hitSlop={8}
      haptic
      accessibilityRole="button"
      accessibilityLabel="Undo"
      onPress={() => {
        if (fired.current) return;
        fired.current = true;
        setHidden(true);
        onUndo();
      }}
      style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: t.radius.row }}
    >
      <AppText variant="micro" mono color={t.c.accent}>
        Undo ({seconds})
      </AppText>
    </PressableRow>
  );
}

export const ReceiptChip = memo(function ReceiptChip({
  action,
  undoable,
  onUndo,
}: {
  action: ReceiptAction;
  undoable: boolean;
  onUndo: () => void;
}) {
  const t = useTheme();
  const result = actionResult(action);
  const failed = result.ok === false || Boolean(result.error);

  const dotColor = action.name.startsWith("delete_")
    ? t.c.coral
    : action.name.startsWith("find_")
      ? t.c.inkFaint
      : action.name === "remember_fact" || action.name === "ask_clarification"
        ? t.c.violet
        : action.name.includes("capture")
          ? t.c.sage
          : action.name.includes("event")
            ? t.c.coral
            : t.c.amber;

  return (
    <View
      style={{
        backgroundColor: t.c.surface,
        borderRadius: t.radius.btn,
        paddingHorizontal: 10,
        paddingVertical: 8,
        gap: 2,
        borderLeftWidth: failed ? 3 : 0,
        borderLeftColor: failed ? t.c.coral : "transparent",
        opacity: action.undone ? 0.55 : 1,
      }}
    >
      <View style={styles.headerRow}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <AppText variant="micro" mono muted style={{ flex: 1 }}>
          {intentLabel(action.name)}
        </AppText>
        {action.undone ? (
          <AppText variant="micro" mono faint>
            Undone
          </AppText>
        ) : failed ? (
          <AppText variant="micro" mono color={t.c.coral}>
            ✕
          </AppText>
        ) : (
          <>
            {undoable ? <UndoCountdown onUndo={onUndo} /> : null}
            <AppText variant="micro" mono faint>
              ✓
            </AppText>
          </>
        )}
      </View>
      <AppText
        variant="meta"
        numberOfLines={2}
        muted={action.undone}
        style={action.undone ? { textDecorationLine: "line-through" } : undefined}
      >
        {summaryOf(action)}
      </AppText>
    </View>
  );
});

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
