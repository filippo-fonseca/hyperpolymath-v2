import * as Haptics from "expo-haptics";
import { Flame } from "lucide-react-native";
import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";

import {
  nextLadderStatus,
  type HabitDayRow,
  type HabitLadderStatus,
} from "@/data/useHabits";
import { tintFor, useTheme, withAlpha } from "@/theme";
import { AppText, PressableRow } from "@/ui";

import { HabitStatusRing } from "./HabitStatusRing";

const PARTIAL_LABEL: Partial<Record<HabitLadderStatus, string>> = {
  in_progress: "Started",
  almost_done: "Almost done",
};

const NEXT_ACTION: Record<HabitLadderStatus, string> = {
  not_started: "mark started",
  in_progress: "mark almost done",
  almost_done: "mark done",
  done: "reset",
};

export interface HabitRowProps {
  row: HabitDayRow;
  onAdvance: (habitId: string) => void;
  onLongPress: (habitId: string) => void;
  /** Quieter rendering for the "Not today" section. */
  quiet?: boolean;
}

/**
 * One habit: tinted wash, status ring, name, streak. Tap cycles the
 * ladder; reaching done earns a ~4% spring pulse and a success haptic.
 */
export const HabitRow = React.memo(function HabitRow({
  row,
  onAdvance,
  onLongPress,
  quiet = false,
}: HabitRowProps) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const tint = tintFor(row.habit.id, t.scheme);
  const scale = useSharedValue(1);
  const prevDone = useRef(row.doneToday);

  useEffect(() => {
    if (row.doneToday && !prevDone.current && !reduced) {
      scale.value = withSequence(
        withSpring(1.04, { damping: 12, stiffness: 260 }),
        withSpring(1, { damping: 16, stiffness: 220 }),
      );
    }
    prevDone.current = row.doneToday;
  }, [row.doneToday, reduced, scale]);

  const pulse = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const partial = PARTIAL_LABEL[row.statusToday];
  const { streak } = row;

  return (
    <Animated.View style={pulse}>
      <PressableRow
        accessibilityRole="button"
        accessibilityLabel={`${row.habit.name}, tap to ${NEXT_ACTION[row.statusToday]}`}
        onPress={() => {
          if (nextLadderStatus(row.statusToday) === "done") {
            void Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
          } else {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          onAdvance(row.habit.id);
        }}
        onLongPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onLongPress(row.habit.id);
        }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          minHeight: 48,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: t.radius.tile,
          backgroundColor: quiet ? "transparent" : withAlpha(tint.bg, 0.6),
          marginBottom: 6,
        }}
      >
        <HabitStatusRing status={row.statusToday} tint={tint} />
        {row.habit.icon ? (
          <AppText variant="body">{row.habit.icon}</AppText>
        ) : null}
        <View style={{ flex: 1 }}>
          <AppText
            variant="body"
            faint={row.doneToday || quiet}
            numberOfLines={1}
            style={
              row.doneToday ? { textDecorationLine: "line-through" } : undefined
            }
          >
            {row.habit.name}
          </AppText>
          {partial ? (
            <AppText variant="micro" faint>
              {partial}
            </AppText>
          ) : null}
        </View>
        {streak.current > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Flame size={12} color={t.c.inkFaint} />
            <AppText variant="micro" mono muted>
              {streak.current}
              {streak.saturated ? "+" : ""}
            </AppText>
          </View>
        ) : null}
      </PressableRow>
    </Animated.View>
  );
});
