import * as Haptics from "expo-haptics";
import { ChevronDown, ChevronUp, Plus, Repeat } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useHabitDay, type Habit } from "@/data/useHabits";
import { useTheme } from "@/theme";
import {
  AppText,
  Card,
  EmptyState,
  Button,
  FAB,
  PressableRow,
  ProgressBar,
  Screen,
  ScreenHeader,
  SectionHeader,
  SkeletonRows,
} from "@/ui";

import { HabitRow } from "./HabitRow";
import { HabitSheet } from "./HabitSheet";

function todaySubtitle(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function HabitsScreen() {
  const t = useTheme();
  const reduced = useReducedMotion();
  const day = useHabitDay();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // One-shot ring burst around the progress card when the last scheduled
  // habit lands. Only fires on a transition observed after data has loaded,
  // so opening the app onto an already-finished day stays quiet.
  const burst = useSharedValue(0);
  const prevDone = useRef(0);
  const hadData = useRef(false);
  useEffect(() => {
    if (day.isLoading) return;
    const complete =
      day.scheduledCount > 0 && day.doneCount === day.scheduledCount;
    if (hadData.current && complete && prevDone.current < day.scheduledCount) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (!reduced) {
        const c = t.motion.bezier.easeOutQuart;
        burst.value = 0;
        burst.value = withTiming(1, {
          duration: 320,
          easing: Easing.bezier(c[0], c[1], c[2], c[3]),
        });
      }
    }
    prevDone.current = day.doneCount;
    hadData.current = true;
  }, [day.doneCount, day.scheduledCount, day.isLoading, reduced, burst, t.motion]);

  const burstStyle = useAnimatedStyle(() => ({
    opacity: burst.value === 0 ? 0 : 1 - burst.value,
    transform: [{ scale: 1 + burst.value * 0.06 }],
  }));

  const unscheduled = useMemo(
    () => day.rows.filter((r) => !r.scheduledToday),
    [day.rows],
  );

  const openEditor = useCallback(
    (habitId: string) => {
      const row = day.rows.find((r) => r.habit.id === habitId);
      if (row) {
        setEditing(row.habit);
        setSheetOpen(true);
      }
    },
    [day.rows],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    day.refetch();
    setTimeout(() => setRefreshing(false), 700);
  }, [day]);

  const ratio = day.scheduledCount > 0 ? day.doneCount / day.scheduledCount : 0;

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.c.inkFaint}
          />
        }
      >
        <ScreenHeader title="Habits" subtitle={todaySubtitle()} />

        {day.isLoading ? (
          <View style={{ marginTop: 12 }}>
            <SkeletonRows rows={5} />
          </View>
        ) : day.isError ? (
          <EmptyState
            icon={<Repeat size={20} color={t.c.inkFaint} />}
            title="Couldn't load habits."
            caption="Check your connection."
            action={
              <Button
                label="Retry"
                variant="outline"
                size="sm"
                onPress={day.refetch}
              />
            }
          />
        ) : day.rows.length === 0 ? (
          <EmptyState
            icon={<Repeat size={20} color={t.c.inkFaint} />}
            title="No habits yet."
            caption="Create the first one with the plus button."
          />
        ) : (
          <>
            <View style={{ marginTop: 8 }}>
              <Card padding={14}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <AppText variant="meta" muted>
                    Completed
                  </AppText>
                  <AppText variant="meta" mono>
                    {day.doneCount}/{day.scheduledCount}
                  </AppText>
                </View>
                <ProgressBar ratio={ratio} />
              </Card>
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    top: -3,
                    left: -3,
                    right: -3,
                    bottom: -3,
                    borderRadius: t.radius.card + 3,
                    borderWidth: 1.5,
                    borderColor: t.c.sage,
                  },
                  burstStyle,
                ]}
              />
            </View>

            <SectionHeader title="Today" count={day.today.length} />
            {day.today.length === 0 ? (
              <AppText variant="meta" muted style={{ paddingVertical: 12 }}>
                Nothing scheduled today.
              </AppText>
            ) : (
              day.today.map((row, i) => (
                <Animated.View
                  key={row.habit.id}
                  entering={FadeInDown.duration(t.motion.duration.enter).delay(
                    Math.min(i, 8) * 24,
                  )}
                >
                  <HabitRow
                    row={row}
                    onAdvance={day.advance}
                    onLongPress={openEditor}
                  />
                </Animated.View>
              ))
            )}

            {unscheduled.length > 0 ? (
              <>
                <SectionHeader
                  title="Not today"
                  count={unscheduled.length}
                  right={
                    <PressableRow
                      accessibilityRole="button"
                      accessibilityLabel={
                        showUnscheduled
                          ? "Collapse unscheduled habits"
                          : "Show unscheduled habits"
                      }
                      onPress={() => setShowUnscheduled((v) => !v)}
                      style={{ padding: 4, borderRadius: t.radius.row }}
                    >
                      {showUnscheduled ? (
                        <ChevronUp size={16} color={t.c.inkMuted} />
                      ) : (
                        <ChevronDown size={16} color={t.c.inkMuted} />
                      )}
                    </PressableRow>
                  }
                />
                {showUnscheduled
                  ? unscheduled.map((row) => (
                      <HabitRow
                        key={row.habit.id}
                        row={row}
                        quiet
                        onAdvance={day.advance}
                        onLongPress={openEditor}
                      />
                    ))
                  : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      <FAB
        accessibilityLabel="New habit"
        icon={
          <Plus
            size={24}
            color={t.scheme === "dark" ? t.c.canvas : "#ffffff"}
            strokeWidth={2.2}
          />
        }
        onPress={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
      />

      <HabitSheet
        visible={sheetOpen}
        habit={editing}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
      />
    </Screen>
  );
}
