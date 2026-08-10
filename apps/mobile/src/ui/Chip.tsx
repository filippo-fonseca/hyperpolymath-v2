import React from "react";
import { StyleSheet } from "react-native";

import { useTheme, withAlpha, type Tint } from "@/theme";
import { AppText } from "./AppText";
import { PressableRow, type PressableRowProps } from "./PressableRow";

export interface ChipProps extends PressableRowProps {
  label: string;
  active?: boolean;
  /** Active fill hue; falls back to neutral selected fill. */
  tint?: Tint;
  icon?: React.ReactNode;
}

/** 28px pill chip. Active state fills with the tint, mirroring .craft-chip. */
export function Chip({ label, active = false, tint, icon, style, ...rest }: ChipProps) {
  const t = useTheme();
  const activeBg = tint ? tint.bg : t.c.selected;
  const activeEdge = tint ? withAlpha(tint.edge, 0.55) : t.c.edgeStrong;
  const activeInk = tint ? tint.ink : t.c.ink;

  return (
    <PressableRow
      {...rest}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        {
          height: 28,
          paddingHorizontal: 12,
          borderRadius: t.radius.pill,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: active ? activeBg : t.c.surfaceRaised,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: active ? activeEdge : t.c.edge,
        },
        style,
      ]}
    >
      {icon}
      <AppText
        variant="meta"
        weight="medium"
        color={active ? activeInk : t.c.inkMuted}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </PressableRow>
  );
}
