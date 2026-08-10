import React from "react";
import { View, type ViewProps } from "react-native";

import { AppText } from "./AppText";

export interface SectionHeaderProps extends ViewProps {
  title: string;
  /** Faint mono count/stamp on the right of the title. */
  count?: number | string;
  right?: React.ReactNode;
}

/** In-screen section heading: semibold body ink + faint mono count. */
export function SectionHeader({ title, count, right, style, ...rest }: SectionHeaderProps) {
  return (
    <View
      {...rest}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 20,
          marginBottom: 8,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <AppText variant="body" weight="semibold">
          {title}
        </AppText>
        {count !== undefined ? (
          <AppText variant="micro" mono faint>
            {String(count)}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export interface ScreenHeaderProps extends ViewProps {
  /** Micro eyebrow above the title. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

/** Top-of-screen header: eyebrow → display title → meta subtitle. */
export function ScreenHeader({
  eyebrow,
  title,
  subtitle,
  right,
  style,
  ...rest
}: ScreenHeaderProps) {
  return (
    <View {...rest} style={[{ paddingTop: 12, paddingBottom: 4 }, style]}>
      {eyebrow ? (
        <AppText variant="micro" weight="medium" faint style={{ marginBottom: 2 }}>
          {eyebrow}
        </AppText>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <AppText variant="display" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </AppText>
        {right}
      </View>
      {subtitle ? (
        <AppText variant="meta" muted style={{ marginTop: 2 }}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}
