import { Divider, HStack, Spacer, Text, VStack } from "@expo/ui/swift-ui";
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

export type TodayWidgetTask = {
  title: string;
  overdue: boolean;
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
  const app = "#1C1D28";

  const dateLabel = props.dateLabel || "Today";
  const overdueCount = props.overdueCount ?? 0;
  const dueTodayCount = props.dueTodayCount ?? 0;
  const habitDone = props.habitDone ?? 0;
  const habitTotal = props.habitTotal ?? 0;
  const tasks = props.tasks ?? [];
  const events = props.events ?? [];
  const updatedAt = props.updatedAt || "";

  // "7 due · 436 overdue" — overdue stays quiet secondary text, never a headline.
  const summaryParts: string[] = [];
  if (dueTodayCount > 0) summaryParts.push(`${dueTodayCount} due`);
  if (overdueCount > 0) summaryParts.push(`${overdueCount} overdue`);
  const summary = summaryParts.length > 0 ? summaryParts.join("  ·  ") : "Nothing due";

  const nextEvent = events.length > 0 ? events[0] : null;
  const footerParts: string[] = [];
  if (habitTotal > 0) footerParts.push(`habits ${habitDone}/${habitTotal}`);
  if (nextEvent) footerParts.push(`${nextEvent.time}  ${nextEvent.title}`);
  const footer = footerParts.join("  ·  ");

  return (
    <VStack
      alignment="leading"
      spacing={9}
      modifiers={[
        containerBackground(app, "widget"),
        padding({ all: 16 }),
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

      <Text
        modifiers={[
          font({ size: 11, design: "monospaced" }),
          foregroundStyle(inkFaint),
          lineLimit(1),
        ]}
      >
        {summary}
      </Text>

      <Divider modifiers={[opacity(0.18)]} />

      {/* The list must be the sole child of its container: expo-widgets' Swift
          child parser casts each child to a dictionary and silently drops
          nested arrays, so a .map() may never sit beside a sibling element. */}
      <VStack alignment="leading" spacing={10} modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}>
        {tasks.length === 0 ? (
          <Text modifiers={[font({ size: 14 }), foregroundStyle(inkFaint)]}>All clear for today.</Text>
        ) : (
          tasks.map((task) => (
            <HStack key={task.title} spacing={10} alignment="center">
              <Text modifiers={[font({ size: 8 }), foregroundStyle(task.overdue ? coral : accent)]}>●</Text>
              <Text
                modifiers={[
                  font({ size: 14 }),
                  foregroundStyle(ink),
                  lineLimit(1),
                  truncationMode("tail"),
                ]}
              >
                {task.title}
              </Text>
              <Spacer />
            </HStack>
          ))
        )}
      </VStack>

      <Spacer />

      {footer ? <Divider modifiers={[opacity(0.18)]} /> : null}
      {footer ? (
        <Text
          modifiers={[
            font({ size: 10, design: "monospaced" }),
            foregroundStyle(inkFaint),
            lineLimit(1),
            truncationMode("tail"),
          ]}
        >
          {footer}
        </Text>
      ) : null}
    </VStack>
  );
};

export default createWidget<TodayWidgetProps>("TodayWidget", TodayWidget);
