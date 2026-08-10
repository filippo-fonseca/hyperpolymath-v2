import { Button, HStack, Image, ProgressView, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  tint,
  truncationMode,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

export type HabitsWidgetHabit = {
  id: string;
  name: string;
  /** Ladder rung index: 0 not_started · 1 in_progress · 2 almost_done (done rows never ship). */
  rung: number;
};

export type HabitsWidgetProps = {
  done: number;
  scheduled: number;
  /** Open (non-done) scheduled habits, partial-progress first. */
  habits: HabitsWidgetHabit[];
  /** habitId → rung set from the widget, drained to the API by the app. */
  pending: { [id: string]: number };
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
      spacing={10}
      modifiers={[
        containerBackground(bg, "widget"),
        padding({ all: 16 }),
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
        spacing={6}
        modifiers={[frame({ maxWidth: Infinity, alignment: "leading" })]}
      >
        {habits.length === 0 ? (
          <Text modifiers={[font({ size: 12 }), foregroundStyle(faint)]}>
            {scheduled > 0 ? "All done." : "Nothing scheduled today."}
          </Text>
        ) : (
          habits.map((habit) => (
            <Button
              key={habit.id}
              target={`habit:${habit.id}`}
              onPress={() => {
                // Optimistic ladder advance; the app drains `pending` into the
                // real PUT on its next wake. Reaching done removes the row.
                const rows = props.habits ?? [];
                const next = Math.min(3, (habit.rung ?? 0) + 1);
                const pending = { ...(props.pending ?? {}), [habit.id]: next };
                if (next >= 3) {
                  return {
                    habits: rows.filter((h) => h.id !== habit.id),
                    done: (props.done ?? 0) + 1,
                    pending,
                  };
                }
                return {
                  habits: rows.map((h) =>
                    h.id === habit.id ? { id: h.id, name: h.name, rung: next } : h,
                  ),
                  pending,
                };
              }}
              modifiers={[buttonStyle("plain")]}
            >
              <HStack
                spacing={8}
                alignment="center"
                modifiers={[frame({ maxWidth: Infinity, height: 26, alignment: "leading" })]}
              >
                <Image
                  systemName={
                    habit.rung === 2
                      ? "circle.fill"
                      : habit.rung === 1
                        ? "circle.lefthalf.filled"
                        : "circle"
                  }
                  size={13}
                  color={habit.rung > 0 ? accent : faint}
                />
                <Text
                  modifiers={[
                    font({ size: 13 }),
                    foregroundStyle(ink),
                    lineLimit(1),
                    truncationMode("tail"),
                  ]}
                >
                  {habit.name}
                </Text>
                <Spacer />
              </HStack>
            </Button>
          ))
        )}
      </VStack>

      <Spacer />
    </VStack>
  );
};

export default createWidget<HabitsWidgetProps>("HabitsWidget", HabitsWidget);
