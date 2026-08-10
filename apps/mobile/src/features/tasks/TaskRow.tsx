import * as Haptics from "expo-haptics";
import { Check } from "lucide-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import type { Task } from "@/data/useTasks";
import { tints, useTheme } from "@/theme";
import { AppText, PressableRow } from "@/ui";

import { dueInfo } from "./sections";

export interface TaskRowProps {
  task: Task;
  todayISO: string;
  onComplete: (id: string) => void;
  onUncheck: (id: string) => void;
  onOpen: (task: Task) => void;
}

const LEAVE_MS = 200;

/**
 * One task row. Completing fills the ring, fires a success haptic, slides
 * the row out x:-20, then commits — the optimistic update re-seats it in
 * the completed cluster.
 */
export const TaskRow = React.memo(function TaskRow({
  task,
  todayISO,
  onComplete,
  onUncheck,
  onOpen,
}: TaskRowProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const done = task.status === "lesno";
  const due = dueInfo(task.dueDate, todayISO);
  const pending = task.id.startsWith("temp-");

  const [committing, setCommitting] = useState(false);
  const leaving = useSharedValue(0);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FlashList recycles row instances: reset animation state when this
  // instance is handed a different task, and settle the row once the
  // optimistic update re-seats it (done) so it isn't stuck slid-out.
  const idRef = useRef(task.id);
  useEffect(() => {
    if (idRef.current !== task.id) {
      idRef.current = task.id;
      setCommitting(false);
      leaving.value = 0;
    }
  }, [task.id, leaving]);
  useEffect(() => {
    if (done) {
      setCommitting(false);
      leaving.value = 0;
    }
  }, [done, leaving]);
  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    },
    [],
  );

  const leaveStyle = useAnimatedStyle(() => ({
    opacity: 1 - leaving.value * 0.9,
    transform: [{ translateX: -20 * leaving.value }],
  }));

  const handleCheck = useCallback(() => {
    if (pending) return;
    if (done) {
      void Haptics.selectionAsync();
      onUncheck(task.id);
      return;
    }
    if (committing) return;
    setCommitting(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (reduced) {
      onComplete(task.id);
      return;
    }
    leaving.value = withTiming(1, {
      duration: LEAVE_MS,
      easing: Easing.bezier(0.25, 1, 0.5, 1),
    });
    commitTimer.current = setTimeout(() => onComplete(task.id), LEAVE_MS + 20);
  }, [pending, done, committing, reduced, leaving, onComplete, onUncheck, task.id]);

  const filled = done || committing;
  const dueColor =
    due?.kind === "overdue"
      ? t.c.coral
      : due?.kind === "today"
        ? tints[t.scheme].butter.ink
        : t.c.inkFaint;

  const project = task.projects[0]?.name;

  return (
    <Animated.View style={leaveStyle}>
      <PressableRow
        onPress={() => !pending && onOpen(task)}
        accessibilityRole="button"
        accessibilityLabel={task.title}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 9,
          paddingHorizontal: 10,
          borderRadius: t.radius.btn,
          opacity: pending ? 0.55 : 1,
        }}
      >
        <Pressable
          onPress={handleCheck}
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? "Mark not done" : "Complete"}
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: filled ? 0 : 1.5,
            borderColor: t.c.edgeStrong,
            backgroundColor: filled ? t.c.ink : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {filled ? <Check size={12} color={t.c.canvas} strokeWidth={3} /> : null}
        </Pressable>

        {task.priority === "P1" && !done ? (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: t.c.coral,
            }}
          />
        ) : null}

        <AppText
          variant="body"
          numberOfLines={1}
          faint={done}
          style={{
            flex: 1,
            ...(done ? { textDecorationLine: "line-through" as const } : null),
          }}
        >
          {task.title}
        </AppText>

        {project ? (
          <AppText variant="micro" faint numberOfLines={1} style={{ maxWidth: 88 }}>
            {project}
          </AppText>
        ) : null}
        {due && !done ? (
          <AppText variant="micro" weight="medium" color={dueColor}>
            {due.text}
          </AppText>
        ) : null}
      </PressableRow>
    </Animated.View>
  );
});

/** Hairline separator between the open list and the completed cluster. */
export function ClusterDivider() {
  const t = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: t.c.edge,
        marginTop: 14,
        marginBottom: 2,
      }}
    />
  );
}
