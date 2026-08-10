import React from "react";
import { Text, type TextProps } from "react-native";

import { useTheme } from "@/theme";
import type { TypeVariant } from "@/theme";

export type TextWeight = "regular" | "medium" | "semibold" | "bold";

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  weight?: TextWeight;
  /** JetBrains Mono with tabular numerals — numerics and micro-labels only. */
  mono?: boolean;
  /** Explicit ink override; wins over muted/faint. */
  color?: string;
  muted?: boolean;
  faint?: boolean;
}

export function AppText({
  variant = "body",
  weight = "regular",
  mono = false,
  color,
  muted = false,
  faint = false,
  style,
  children,
  ...rest
}: AppTextProps) {
  const t = useTheme();
  const step = t.type[variant];

  const family = mono
    ? weight === "regular"
      ? t.fonts.mono
      : t.fonts.monoMedium
    : weight === "bold"
      ? t.fonts.sansBold
      : weight === "semibold"
        ? t.fonts.sansSemiBold
        : weight === "medium"
          ? t.fonts.sansMedium
          : t.fonts.sans;

  const ink = color ?? (faint ? t.c.inkFaint : muted ? t.c.inkMuted : t.c.ink);

  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: family,
          fontSize: step.fontSize,
          lineHeight: step.lineHeight,
          letterSpacing: step.letterSpacing,
          color: ink,
          ...(mono ? { fontVariant: ["tabular-nums"] as const } : null),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** EB Garamond wordmark text — the only sanctioned serif in the app. */
export function Logotype({
  size = 22,
  color,
  style,
  children = "Hyperpolymath",
  ...rest
}: TextProps & { size?: number; color?: string }) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      style={[
        {
          fontFamily: t.fonts.logotype,
          fontSize: size,
          color: color ?? t.c.ink,
          letterSpacing: size * -0.01,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
