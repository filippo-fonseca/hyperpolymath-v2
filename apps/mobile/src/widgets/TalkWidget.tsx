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

type TalkWidgetProps = {
  ready?: boolean;
};

const TalkWidget = (_props: TalkWidgetProps, _environment: WidgetEnvironment) => {
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
        widgetURL("jarvis://talk"),
      ]}
    >
      <Spacer />
      <Image systemName="waveform.circle.fill" size={36} color={accent} />
      <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(ink)]}>Talk</Text>
      <Text modifiers={[font({ size: 10, design: "monospaced" }), foregroundStyle(inkFaint)]}>
        JARVIS
      </Text>
      <Spacer />
    </VStack>
  );
};

export default createWidget<TalkWidgetProps>("TalkWidget", TalkWidget);
