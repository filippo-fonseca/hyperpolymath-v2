import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";

import {
  fonts,
  motion,
  palettes,
  radius,
  shadows,
  type Palette,
  type Scheme,
  type ShadowPreset,
  type TypeStep,
  type TypeVariant,
  type,
} from "./tokens";

export interface Theme {
  scheme: Scheme;
  c: Palette;
  type: Record<TypeVariant, TypeStep>;
  fonts: typeof fonts;
  radius: typeof radius;
  shadow: Record<"card" | "float" | "pop", ShadowPreset>;
  motion: typeof motion;
}

function buildTheme(scheme: Scheme): Theme {
  return {
    scheme,
    c: palettes[scheme],
    type,
    fonts,
    radius,
    shadow: shadows[scheme],
    motion,
  };
}

const ThemeContext = createContext<Theme>(buildTheme("light"));

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const scheme: Scheme = systemScheme === "dark" ? "dark" : "light";
  const value = useMemo(() => buildTheme(scheme), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
