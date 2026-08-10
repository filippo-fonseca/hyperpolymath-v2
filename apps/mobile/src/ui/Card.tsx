import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { useTheme } from "@/theme";

export interface CardProps extends ViewProps {
  /** Inner padding (16 default, 0 to manage yourself). */
  padding?: number;
  /** Drop the shadow for nested/inset cards. */
  flat?: boolean;
  /** Inset sub-card look: surface bg, radius 10, no shadow, no border. */
  inset?: boolean;
}

/** The workhorse content surface — surfaceRaised, hairline edge, radius 14. */
export function Card({
  padding = 16,
  flat = false,
  inset = false,
  style,
  children,
  ...rest
}: CardProps) {
  const t = useTheme();
  return (
    <View
      {...rest}
      style={[
        inset
          ? {
              backgroundColor: t.c.surface,
              borderRadius: t.radius.btn,
              padding,
            }
          : {
              backgroundColor: t.c.surfaceRaised,
              borderColor: t.c.edge,
              borderWidth: StyleSheet.hairlineWidth,
              borderRadius: t.radius.card,
              padding,
              ...(flat ? null : t.shadow.card),
            },
        style,
      ]}
    >
      {children}
    </View>
  );
}
