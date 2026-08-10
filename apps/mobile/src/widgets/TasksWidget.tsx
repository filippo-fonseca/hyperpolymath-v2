import { Button, Divider, HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  buttonStyle,
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
  /** "14:30" when the task has a due time, else "". Today-only widget — no date word. */
  time: string;
  p1: boolean;
};

export type TasksWidgetProps = {
  /** Open (non-lesno) tasks due today — the row denominator. */
  todayCount: number;
  /** Tasks due today already completed (incl. optimistic widget completes). */
  doneCount: number;
  overdueCount: number;
  /** Today-only, priority-ordered; overdue never appears as a row. */
  tasks: TasksWidgetTask[];
  /** Task ids completed from the widget, drained to the API by the app. */
  pending: string[];
};

const TasksWidget = (props: TasksWidgetProps, environment: WidgetEnvironment) => {
  "widget";

  // Craft palette (REBUILD.md) — hardcoded because the Swift bundle cannot
  // import src/theme; keep in sync with src/theme/tokens.ts.
  const dark = environment.colorScheme === "dark";
  const bg = dark ? "#272a2e" : "#ffffff";
  const ink = dark ? "#d6d9dd" : "#36302c";
  const faint = dark ? "#797c81" : "#98938f";
  const coral = dark ? "#e66e68" : "#d95b56";
  const butter = dark ? "#dbd1ad" : "#6e580f";

  const todayCount = props.todayCount ?? 0;
  const doneCount = props.doneCount ?? 0;
  const overdueCount = props.overdueCount ?? 0;
  const maxRows = environment.widgetFamily === "systemLarge" ? 7 : 4;
  const tasks = (props.tasks ?? []).slice(0, maxRows);

  return (
    <VStack
      alignment="leading"
      spacing={10}
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
          {`${todayCount} today`}
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
        spacing={6}
        modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}
      >
        {tasks.length === 0 ? (
          <Text modifiers={[font({ size: 13 }), foregroundStyle(faint)]}>
            All clear for today.
          </Text>
        ) : (
          tasks.map((task) => (
            <Button
              key={task.id}
              target={`task:${task.id}`}
              onPress={() => ({
                // Optimistic: the intent merges this into the stored entry so
                // the row leaves instantly; the app drains `pending` into the
                // real PATCH on its next wake.
                tasks: (props.tasks ?? []).filter((t) => t.id !== task.id),
                todayCount: Math.max(0, (props.todayCount ?? 0) - 1),
                doneCount: (props.doneCount ?? 0) + 1,
                pending: [...(props.pending ?? []), task.id],
              })}
              modifiers={[buttonStyle("plain")]}
            >
              <HStack
                spacing={8}
                alignment="center"
                modifiers={[frame({ maxWidth: Infinity, height: 26, alignment: "leading" })]}
              >
                <Image systemName="circle" size={13} color={faint} />
                {task.p1 ? (
                  <Text modifiers={[font({ size: 7 }), foregroundStyle(coral)]}>●</Text>
                ) : null}
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
                {task.time ? (
                  <Text
                    modifiers={[
                      font({ size: 10.5, design: "monospaced" }),
                      foregroundStyle(butter),
                    ]}
                  >
                    {task.time}
                  </Text>
                ) : null}
              </HStack>
            </Button>
          ))
        )}
      </VStack>

      <Spacer />

      {doneCount > 0 ? <Divider modifiers={[opacity(0.35)]} /> : null}
      {doneCount > 0 ? (
        <Text modifiers={[font({ size: 10, design: "monospaced" }), foregroundStyle(faint)]}>
          {`${doneCount} done`}
        </Text>
      ) : null}
    </VStack>
  );
};

export default createWidget<TasksWidgetProps>("TasksWidget", TasksWidget);
