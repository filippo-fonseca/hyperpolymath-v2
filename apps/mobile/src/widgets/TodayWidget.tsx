import { HStack, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

export type TodayWidgetTask = {
  title: string;
  meta: string;
  overdue: boolean;
};

export type TodayWidgetHabit = {
  name: string;
  done: boolean;
};

export type TodayWidgetEvent = {
  time: string;
  title: string;
};

export type TodayWidgetProps = {
  dateLabel: string;
  overdueCount: number;
  dueTodayCount: number;
  habitDone: number;
  habitTotal: number;
  tasks: TodayWidgetTask[];
  habits: TodayWidgetHabit[];
  events: TodayWidgetEvent[];
  updatedAt: string;
};

const TodayWidget = (props: TodayWidgetProps, _environment: WidgetEnvironment) => {
  "widget";

  const ink = "#E8EAF5";
  const inkDull = "#A8AEC4";
  const inkFaint = "#7A8199";
  const accent = "#22D3EE";
  const coral = "#E06B5C";
  const sage = "#6FA87A";
  const app = "#1C1D28";

  const dateLabel = props.dateLabel || "Today";
  const overdueCount = props.overdueCount ?? 0;
  const dueTodayCount = props.dueTodayCount ?? 0;
  const habitDone = props.habitDone ?? 0;
  const habitTotal = props.habitTotal ?? 0;
  const tasks = props.tasks ?? [];
  const habits = props.habits ?? [];
  const events = props.events ?? [];
  const updatedAt = props.updatedAt || "";

  const metric = (label: string, value: string, color: string) => (
    <VStack
      alignment="leading"
      spacing={2}
      modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}
    >
      <Text modifiers={[font({ size: 9, weight: "medium", design: "monospaced" }), foregroundStyle(inkFaint)]}>
        {label}
      </Text>
      <Text modifiers={[font({ size: 22, weight: "semibold" }), foregroundStyle(color)]}>{value}</Text>
    </VStack>
  );

  return (
    <VStack
      alignment="leading"
      spacing={10}
      modifiers={[
        containerBackground(app, "widget"),
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }),
        widgetURL("jarvis://today"),
      ]}
    >
      <HStack alignment="center" spacing={8}>
        <Text modifiers={[font({ size: 11, weight: "medium", design: "monospaced" }), foregroundStyle(accent)]}>
          TODAY
        </Text>
        <Text modifiers={[font({ size: 13, weight: "medium" }), foregroundStyle(inkDull)]}>{dateLabel}</Text>
        <Spacer />
        {updatedAt ? (
          <Text modifiers={[font({ size: 9, design: "monospaced" }), foregroundStyle(inkFaint)]}>
            {updatedAt}
          </Text>
        ) : null}
      </HStack>

      <HStack spacing={12} alignment="top">
        {metric("OVERDUE", String(overdueCount), overdueCount > 0 ? coral : inkDull)}
        {metric("DUE TODAY", String(dueTodayCount), accent)}
        {metric("HABITS", `${habitDone}/${habitTotal}`, sage)}
      </HStack>

      <VStack alignment="leading" spacing={4} modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}>
        <Text modifiers={[font({ size: 10, weight: "medium", design: "monospaced" }), foregroundStyle(inkFaint)]}>
          NEXT TASKS
        </Text>
        {/* The list must be the sole child of its container: expo-widgets' Swift
            child parser casts each child to a dictionary and silently drops
            nested arrays, so a .map() may never sit beside a sibling element. */}
        <VStack alignment="leading" spacing={4} modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}>
          {tasks.length === 0 ? (
            <Text modifiers={[font({ size: 13 }), foregroundStyle(inkFaint)]}>No open tasks.</Text>
          ) : (
            tasks.map((task) => (
              <HStack key={`${task.title}-${task.meta}`} spacing={8} alignment="center">
                <Text modifiers={[font({ size: 10 }), foregroundStyle(task.overdue ? coral : accent)]}>●</Text>
                <VStack alignment="leading" spacing={1} modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}>
                  <Text
                    modifiers={[font({ size: 13, weight: "medium" }), foregroundStyle(ink)]}
                  >
                    {task.title}
                  </Text>
                  <Text modifiers={[font({ size: 10, design: "monospaced" }), foregroundStyle(inkFaint)]}>
                    {task.meta}
                  </Text>
                </VStack>
              </HStack>
            ))
          )}
        </VStack>
      </VStack>

      <HStack spacing={12} alignment="top" modifiers={[frame({ maxWidth: Infinity, alignment: "topLeading" })]}>
        <VStack
          alignment="leading"
          spacing={4}
          modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}
        >
          <Text modifiers={[font({ size: 10, weight: "medium", design: "monospaced" }), foregroundStyle(inkFaint)]}>
            HABITS
          </Text>
          <VStack alignment="leading" spacing={4} modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}>
            {habits.length === 0 ? (
              <Text modifiers={[font({ size: 13 }), foregroundStyle(inkFaint)]}>None today.</Text>
            ) : (
              habits.map((habit) => (
                <HStack key={habit.name} spacing={6} alignment="center">
                  <Text
                    modifiers={[
                      font({ size: 9, weight: "medium", design: "monospaced" }),
                      foregroundStyle(habit.done ? sage : inkFaint),
                    ]}
                  >
                    {habit.done ? "DONE" : "TODO"}
                  </Text>
                  <Text modifiers={[font({ size: 13 }), foregroundStyle(ink)]}>{habit.name}</Text>
                </HStack>
              ))
            )}
          </VStack>
        </VStack>

        <VStack
          alignment="leading"
          spacing={4}
          modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}
        >
          <Text modifiers={[font({ size: 10, weight: "medium", design: "monospaced" }), foregroundStyle(inkFaint)]}>
            UP NEXT
          </Text>
          <VStack alignment="leading" spacing={4} modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}>
            {events.length === 0 ? (
              <Text modifiers={[font({ size: 13 }), foregroundStyle(inkFaint)]}>No events.</Text>
            ) : (
              events.map((event) => (
                <HStack key={`${event.time}-${event.title}`} spacing={6} alignment="center">
                  <Text modifiers={[font({ size: 10, design: "monospaced" }), foregroundStyle(accent)]}>
                    {event.time}
                  </Text>
                  <Text modifiers={[font({ size: 13 }), foregroundStyle(ink)]}>{event.title}</Text>
                </HStack>
              ))
            )}
          </VStack>
        </VStack>
      </HStack>
    </VStack>
  );
};

export default createWidget<TodayWidgetProps>("TodayWidget", TodayWidget);
