import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";

import { useTheme } from "@/theme";

export interface DividerProps extends ViewProps {
  /** Left inset (e.g. to align under row text). */
  inset?: number;
}

/** Hairline rule in the edge tone. */
export function Divider({ inset = 0, style, ...rest }: DividerProps) {
  const t = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          height: StyleSheet.hairlineWidth,
          backgroundColor: t.c.edge,
          marginLeft: inset,
        },
        style,
      ]}
    />
  );
}
