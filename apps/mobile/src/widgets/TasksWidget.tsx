import { Divider, HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  opacity,
  padding,
  truncationMode,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

export type TasksWidgetTask = {
  id: string;
  title: string;
  /** Pre-formatted due label — "Overdue", "Today", or "Aug 12". */
  due: string;
  dueKind: "overdue" | "today" | "future";
  p1: boolean;
};

export type TasksWidgetProps = {
  scheduledCount: number;
  overdueCount: number;
  todayCount: number;
  tasks: TasksWidgetTask[];
};

const TasksWidget = (props: TasksWidgetProps, environment: WidgetEnvironment) => {
  "widget";

  // Craft palette (REBUILD.md) — hardcoded because the Swift bundle cannot
  // import src/theme; keep in sync with src/theme/tokens.ts.
  const dark = environment.colorScheme === "dark";
  const bg = dark ? "#272a2e" : "#ffffff";
  const ink = dark ? "#d6d9dd" : "#36302c";
  const muted = dark ? "#9da0a5" : "#78726d";
  const faint = dark ? "#797c81" : "#98938f";
  const coral = dark ? "#e66e68" : "#d95b56";
  const butter = dark ? "#dbd1ad" : "#6e580f";

  const scheduledCount = props.scheduledCount ?? 0;
  const overdueCount = props.overdueCount ?? 0;
  const todayCount = props.todayCount ?? 0;
  const maxRows = environment.widgetFamily === "systemLarge" ? 7 : 4;
  const tasks = (props.tasks ?? []).slice(0, maxRows);

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        containerBackground(bg, "widget"),
        padding({ all: 16 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }),
        widgetURL("jarvis:///tasks"),
      ]}
    >
      <HStack alignment="center" spacing={6}>
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(ink)]}>
          Tasks
        </Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(faint)]}>
          {`${scheduledCount} scheduled`}
        </Text>
        <Spacer />
        {overdueCount > 0 ? (
          <Text modifiers={[font({ size: 11, weight: "medium" }), foregroundStyle(coral)]}>
            {`${overdueCount} overdue`}
          </Text>
        ) : null}
      </HStack>

      {/* The list must be the sole child of its container: expo-widgets' Swift
          child parser drops a .map() that sits beside a sibling element. */}
      <VStack
        alignment="leading"
        spacing={8}
        modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}
      >
        {tasks.length === 0 ? (
          <Text modifiers={[font({ size: 13 }), foregroundStyle(faint)]}>
            All clear.
          </Text>
        ) : (
          tasks.map((task) => (
            <HStack key={task.id} spacing={8} alignment="center">
              <Image systemName="circle" size={11} color={faint} />
              {task.p1 ? <Text modifiers={[font({ size: 7 }), foregroundStyle(coral)]}>●</Text> : null}
              <Text
                modifiers={[
                  font({ size: 13.5 }),
                  foregroundStyle(ink),
                  lineLimit(1),
                  truncationMode("tail"),
                ]}
              >
                {task.title}
              </Text>
              <Spacer />
              <Text
                modifiers={[
                  font({ size: 10, design: "monospaced" }),
                  foregroundStyle(
                    task.dueKind === "overdue" ? coral : task.dueKind === "today" ? butter : faint,
                  ),
                ]}
              >
                {task.due}
              </Text>
            </HStack>
          ))
        )}
      </VStack>

      <Spacer />

      {todayCount > 0 ? <Divider modifiers={[opacity(0.35)]} /> : null}
      {todayCount > 0 ? (
        <Text modifiers={[font({ size: 10, design: "monospaced" }), foregroundStyle(butter)]}>
          {`${todayCount} today`}
        </Text>
      ) : null}
    </VStack>
  );
};

export default createWidget<TasksWidgetProps>("TasksWidget", TasksWidget);
