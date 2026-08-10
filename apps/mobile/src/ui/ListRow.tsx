import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/theme";
import { PressableRow, type PressableRowProps } from "./PressableRow";

export interface ListRowProps extends PressableRowProps {
  selected?: boolean;
  /** Leading element (icon plate, ring, checkbox). */
  left?: React.ReactNode;
  /** Trailing element (count, chevron, stamp). */
  right?: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Canonical list row: min-height 36, radius 10, hover bg while pressed,
 * selected rows get the 2px accent bar on the left edge.
 */
export function ListRow({
  selected = false,
  left,
  right,
  style,
  contentStyle,
  children,
  ...rest
}: ListRowProps) {
  const t = useTheme();
  return (
    <PressableRow
      {...rest}
      style={[
        {
          minHeight: 36,
          borderRadius: t.radius.btn,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: selected ? t.c.selected : undefined,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {selected ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 6,
            bottom: 6,
            width: 2,
            borderRadius: 1,
            backgroundColor: t.c.accent,
          }}
        />
      ) : null}
      {left}
      <View style={[{ flex: 1, minWidth: 0 }, contentStyle]}>{children}</View>
      {right}
    </PressableRow>
  );
}
