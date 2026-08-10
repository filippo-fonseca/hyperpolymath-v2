import React from "react";
import { View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme";

export interface ScreenProps extends ViewProps {
  /** Horizontal padding, on by default (16). */
  padded?: boolean;
  /** Respect the top safe-area inset (off when a header handles it). */
  topInset?: boolean;
  /** Respect the bottom safe-area inset (off inside the tab bar). */
  bottomInset?: boolean;
}

/** Canvas-colored root container for every screen. */
export function Screen({
  padded = true,
  topInset = true,
  bottomInset = false,
  style,
  children,
  ...rest
}: ScreenProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      {...rest}
      style={[
        {
          flex: 1,
          backgroundColor: t.c.canvas,
          paddingTop: topInset ? insets.top : 0,
          paddingBottom: bottomInset ? insets.bottom : 0,
          paddingHorizontal: padded ? 16 : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
