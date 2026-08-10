import { FlashList } from "@shopify/flash-list";
import { ChevronRight, ListChecks } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTaskMutations, useTasks, type Task } from "@/data/useTasks";
import { useTheme } from "@/theme";
import {
  AppText,
  Button,
  EmptyState,
  PressableRow,
  Screen,
  ScreenHeader,
  SectionHeader,
  SkeletonRows,
} from "@/ui";

import { buildRows, localTodayISO, type Row } from "./sections";
import { ClusterDivider, TaskRow } from "./TaskRow";
import { TaskComposer } from "./TaskComposer";

/** Disclosure row for the sunken completed cluster. */
function CompletedHeader({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTheme();
  const spin = useSharedValue(open ? 1 : 0);
  const chevron = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 90}deg` }],
  }));

  return (
    <View>
      <ClusterDivider />
      <PressableRow
        onPress={() => {
          spin.value = withTiming(open ? 0 : 1, { duration: t.motion.duration.micro });
          onToggle();
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: t.radius.btn,
        }}
      >
        <Animated.View style={chevron}>
          <ChevronRight size={14} color={t.c.inkFaint} strokeWidth={2} />
        </Animated.View>
        <AppText variant="meta" weight="medium" muted>
          Completed
        </AppText>
        <AppText variant="micro" mono faint>
          {count}
        </AppText>
      </PressableRow>
    </View>
  );
}

export default function TasksScreen() {
  const t = useTheme();
  const query = useTasks();
  const { create, updateStatus } = useTaskMutations();
  const [completedOpen, setCompletedOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const todayISO = localTodayISO();

  const { rows, counts } = useMemo(
    () => buildRows(query.data ?? [], todayISO, completedOpen),
    [query.data, todayISO, completedOpen],
  );

  const handleComplete = useCallback(
    (id: string) => updateStatus(id, "lesno"),
    [updateStatus],
  );
  const handleUncheck = useCallback(
    (id: string) => updateStatus(id, "not started"),
    [updateStatus],
  );
  const handleCreate = useCallback(
    (title: string) =>
      create.mutate({ title, dueDate: todayISO, priority: "P3", status: "not started" }),
    [create, todayISO],
  );
  const handleOpen = useCallback((task: Task) => setEditing(task), []);

  const renderItem = useCallback(
    ({ item }: { item: Row }) => {
      switch (item.type) {
        case "section":
          return (
            <SectionHeader
              title={item.title}
              count={item.overdue ? undefined : item.count}
              right={
                item.overdue ? (
                  <AppText variant="micro" mono color={t.c.coral}>
                    {item.count}
                  </AppText>
                ) : undefined
              }
            />
          );
        case "day":
          return (
            <AppText
              variant="micro"
              weight="medium"
              faint
              style={{ marginTop: 8, marginBottom: 2, paddingHorizontal: 10 }}
            >
              {item.label}
            </AppText>
          );
        case "completedHeader":
          return (
            <CompletedHeader
              count={item.count}
              open={item.open}
              onToggle={() => setCompletedOpen((v) => !v)}
            />
          );
        case "task":
          return (
            <TaskRow
              task={item.task}
              todayISO={todayISO}
              onComplete={handleComplete}
              onUncheck={handleUncheck}
              onOpen={handleOpen}
            />
          );
      }
    },
    [t.c.coral, todayISO, handleComplete, handleUncheck, handleOpen],
  );

  const subtitle =
    counts.scheduled + counts.inbox > 0
      ? `${counts.scheduled} scheduled${counts.inbox ? ` · ${counts.inbox} inbox` : ""}`
      : undefined;

  let content: React.ReactNode;
  if (query.isLoading) {
    content = (
      <View style={{ paddingTop: 16 }}>
        <SkeletonRows rows={6} />
      </View>
    );
  } else if (query.isError) {
    content = (
      <EmptyState
        title="Couldn't load tasks"
        caption="Check the connection and try again."
        action={
          <Button
            label="Retry"
            variant="outline"
            size="sm"
            onPress={() => void query.refetch()}
          />
        }
      />
    );
  } else if (rows.length === 0) {
    content = (
      <EmptyState
        icon={<ListChecks size={22} color={t.c.inkFaint} strokeWidth={1.75} />}
        title="Nothing on the list"
        caption="Add one below, or tell Jarvis what needs doing."
      />
    );
  } else {
    content = (
      <FlashList
        data={rows}
        renderItem={renderItem}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={t.c.inkFaint}
          />
        }
      />
    );
  }

  return (
    <Screen>
      <ScreenHeader
        title="Tasks"
        subtitle={subtitle}
        right={
          counts.overdue > 0 ? (
            <AppText variant="meta" weight="medium" color={t.c.coral}>
              {counts.overdue} overdue
            </AppText>
          ) : undefined
        }
      />
      <TaskComposer onSubmit={handleCreate} />
      <View style={{ flex: 1, marginTop: 4 }}>{content}</View>
    </Screen>
  );
}
