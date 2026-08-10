import { HStack, Image, ProgressView, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  strikethrough,
  tint,
  truncationMode,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

export type HabitsWidgetHabit = {
  id: string;
  name: string;
  /** Ladder rung index: 0 not_started · 1 in_progress · 2 almost_done · 3 done. */
  rung: number;
};

export type HabitsWidgetProps = {
  done: number;
  scheduled: number;
  habits: HabitsWidgetHabit[];
};

const HabitsWidget = (props: HabitsWidgetProps, environment: WidgetEnvironment) => {
  "widget";

  // Craft palette (REBUILD.md) — keep in sync with src/theme/tokens.ts.
  const dark = environment.colorScheme === "dark";
  const bg = dark ? "#272a2e" : "#ffffff";
  const ink = dark ? "#d6d9dd" : "#36302c";
  const muted = dark ? "#9da0a5" : "#78726d";
  const faint = dark ? "#797c81" : "#98938f";
  const accent = dark ? "#62b8d8" : "#277c99";

  const done = props.done ?? 0;
  const scheduled = props.scheduled ?? 0;
  const maxRows = environment.widgetFamily === "systemSmall" ? 3 : 4;
  const habits = (props.habits ?? []).slice(0, maxRows);
  const ratio = scheduled > 0 ? done / scheduled : 0;

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        containerBackground(bg, "widget"),
        padding({ all: 14 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "topLeading" }),
        widgetURL("jarvis:///habits"),
      ]}
    >
      <HStack alignment="center" spacing={6}>
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(ink)]}>
          Habits
        </Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(faint)]}>Today</Text>
        <Spacer />
        <Text modifiers={[font({ size: 11, design: "monospaced" }), foregroundStyle(muted)]}>
          {`${done}/${scheduled}`}
        </Text>
      </HStack>

      <ProgressView value={ratio} modifiers={[tint(accent)]} />

      {/* Sole-child list: expo-widgets' Swift parser drops a .map() that sits
          beside a sibling element. */}
      <VStack
        alignment="leading"
        spacing={7}
        modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}
      >
        {habits.length === 0 ? (
          <Text modifiers={[font({ size: 12 }), foregroundStyle(faint)]}>
            Nothing scheduled today.
          </Text>
        ) : (
          habits.map((habit) => (
            <HStack key={habit.id} spacing={8} alignment="center">
              <Image
                systemName={
                  habit.rung >= 3
                    ? "checkmark.circle.fill"
                    : habit.rung === 2
                      ? "circle.fill"
                      : habit.rung === 1
                        ? "circle.lefthalf.filled"
                        : "circle"
                }
                size={12}
                color={habit.rung > 0 ? accent : faint}
              />
              <Text
                modifiers={[
                  font({ size: 13 }),
                  foregroundStyle(habit.rung >= 3 ? faint : ink),
                  strikethrough({ isActive: habit.rung >= 3, pattern: "solid", color: faint }),
                  lineLimit(1),
                  truncationMode("tail"),
                ]}
              >
                {habit.name}
              </Text>
              <Spacer />
            </HStack>
          ))
        )}
      </VStack>

      <Spacer />
    </VStack>
  );
};

export default createWidget<HabitsWidgetProps>("HabitsWidget", HabitsWidget);
