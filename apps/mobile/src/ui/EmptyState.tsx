import React from "react";
import { View, type ViewProps } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useTheme } from "@/theme";
import { AppText } from "./AppText";

export interface EmptyStateProps extends ViewProps {
  icon?: React.ReactNode;
  title: string;
  caption?: string;
  action?: React.ReactNode;
}

/** Centered, quiet empty state with the standard 160ms rise-in. */
export function EmptyState({ icon, title, caption, action, style, ...rest }: EmptyStateProps) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(t.motion.duration.enter).springify().damping(30)}>
      <View
        {...rest}
        style={[
          {
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 48,
            paddingHorizontal: 24,
            gap: 6,
          },
          style,
        ]}
      >
        {icon ? <View style={{ marginBottom: 6, opacity: 0.85 }}>{icon}</View> : null}
        <AppText variant="body" weight="medium">
          {title}
        </AppText>
        {caption ? (
          <AppText variant="meta" muted style={{ textAlign: "center" }}>
            {caption}
          </AppText>
        ) : null}
        {action ? <View style={{ marginTop: 12 }}>{action}</View> : null}
      </View>
    </Animated.View>
  );
}
