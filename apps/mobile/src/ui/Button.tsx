import React from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/theme";
import { AppText } from "./AppText";
import { PressableRow, type PressableRowProps } from "./PressableRow";
import { Spinner } from "./Spinner";

export interface ButtonProps extends PressableRowProps {
  label: string;
  variant?: "primary" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

const HEIGHTS = { sm: 32, md: 36, lg: 44 } as const;

/** Buttons in the sd-btn grammar: accent solid, hairline outline, ghost. */
export function Button({
  label,
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const t = useTheme();
  const height = HEIGHTS[size];
  const solid = variant === "primary";
  const ink =
    variant === "primary"
      ? t.scheme === "dark"
        ? t.c.canvas
        : "#ffffff"
      : variant === "destructive"
        ? t.c.coral
        : t.c.ink;

  return (
    <PressableRow
      {...rest}
      disabled={disabled || loading}
      accessibilityRole="button"
      pressColor={solid ? t.c.accent : t.c.hover}
      style={[
        {
          height,
          paddingHorizontal: size === "lg" ? 20 : 14,
          borderRadius: t.radius.btn,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: solid ? t.c.accent : "transparent",
          borderWidth: variant === "outline" || variant === "destructive" ? StyleSheet.hairlineWidth : 0,
          borderColor: variant === "destructive" ? t.c.coral : t.c.edgeStrong,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <Spinner size="sm" color={ink} />
      ) : (
        <>
          {icon ? <View>{icon}</View> : null}
          <AppText
            variant={size === "sm" ? "meta" : "body"}
            weight="medium"
            color={ink}
            numberOfLines={1}
          >
            {label}
          </AppText>
        </>
      )}
    </PressableRow>
  );
}
