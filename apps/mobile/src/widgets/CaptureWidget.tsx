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

const CaptureWidget = (_props: CaptureWidgetProps, _environment: WidgetEnvironment) => {
  "widget";

  const ink = "#E8EAF5";
  const inkFaint = "#7A8199";
  const accent = "#22D3EE";
  const app = "#1C1D28";

  return (
    <VStack
      alignment="center"
      spacing={8}
      modifiers={[
        containerBackground(app, "widget"),
        padding({ all: 12 }),
        frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: "center" }),
        widgetURL("jarvis://captures/new"),
      ]}
    >
      <Spacer />
      <Image systemName="tray.and.arrow.down.fill" size={34} color={accent} />
      <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(ink)]}>Capture</Text>
      <Text modifiers={[font({ size: 10, design: "monospaced" }), foregroundStyle(inkFaint)]}>
        QUICK
      </Text>
      <Spacer />
    </VStack>
  );
};

export default createWidget<CaptureWidgetProps>("CaptureWidget", CaptureWidget);
