import { Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

type CaptureWidgetProps = {
  ready?: boolean;
};

const CaptureWidget = (_props: CaptureWidgetProps, environment: WidgetEnvironment) => {
  "widget";

  // Inside the function body: the widget bundle ships only this closure, so a
  // module-level constant is a ReferenceError at widget runtime. Finite
  // because Infinity does not survive the JS→Swift bridge.
  const FILL = 10000;

  // Craft palette (REBUILD.md) — keep in sync with src/theme/tokens.ts.
  const dark = environment.colorScheme === "dark";
  const bg = dark ? "#272a2e" : "#ffffff";
  const ink = dark ? "#d6d9dd" : "#36302c";
  const muted = dark ? "#9da0a5" : "#78726d";
  const accent = dark ? "#62b8d8" : "#277c99";

  return (
    <VStack
      alignment="center"
      spacing={6}
      modifiers={[
        containerBackground(bg, "widget"),
        padding({ all: 12 }),
        frame({ maxWidth: FILL, maxHeight: FILL, alignment: "center" }),
        widgetURL("jarvis:///captures?compose=1"),
      ]}
    >
      <Spacer />
      <Image systemName="square.and.pencil" size={30} color={accent} />
      <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(ink)]}>
        Capture
      </Text>
      <Text modifiers={[font({ size: 10 }), foregroundStyle(muted)]}>
        really anything…
      </Text>
      <Spacer />
    </VStack>
  );
};

export default createWidget<CaptureWidgetProps>("CaptureWidget", CaptureWidget);
