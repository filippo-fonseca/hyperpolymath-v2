import { Redirect, Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import {
  Inbox,
  ListChecks,
  NotebookText,
  Repeat2,
  Sparkles,
  type LucideIcon,
} from "lucide-react-native";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/theme";
import { AppText } from "@/ui";
import { useAuth } from "@/ui/auth";

const ICONS: Record<string, LucideIcon> = {
  wiki: NotebookText,
  tasks: ListChecks,
  habits: Repeat2,
  captures: Inbox,
};

function TabItem({
  label,
  icon: Icon,
  focused,
  onPress,
}: {
  label: string;
  icon: LucideIcon;
  focused: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const focus = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    focus.value = withTiming(focused ? 1 : 0, { duration: t.motion.duration.micro });
  }, [focused, focus, t.motion.duration.micro]);

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(focus.value, [0, 1], [t.c.inkMuted, t.c.ink]),
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 3, paddingTop: 8 }}
    >
      <Icon size={22} strokeWidth={focused ? 2.2 : 1.8} color={focused ? t.c.ink : t.c.inkMuted} />
      <Animated.Text
        style={[
          {
            fontFamily: t.fonts.sansMedium,
            fontSize: 10,
            lineHeight: 12,
          },
          labelStyle,
        ]}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

function JarvisOrb({ focused, onPress }: { focused: boolean; onPress: () => void }) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduced || focused) {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 160 });
      return;
    }
    pulse.value = withRepeat(
      withTiming(1.035, { duration: 1300, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
  }, [reduced, focused, pulse]);

  const scale = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Animated.View style={[{ marginTop: -18 }, scale]}>
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel="Jarvis"
          accessibilityState={{ selected: focused }}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPress();
          }}
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: t.c.accent,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: focused ? 2 : 0,
            borderColor: t.c.canvas,
            ...t.shadow.float,
          }}
        >
          <Sparkles size={24} color={t.scheme === "dark" ? t.c.canvas : "#ffffff"} strokeWidth={2} />
        </Pressable>
      </Animated.View>
      <AppText variant="micro" weight="medium" muted style={{ fontSize: 10, lineHeight: 12, marginTop: 3 }}>
        Jarvis
      </AppText>
    </View>
  );
}

function CraftTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: t.c.surfaceRaised,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: t.c.edge,
        paddingBottom: Math.max(insets.bottom, 8),
        height: 56 + Math.max(insets.bottom, 8),
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = String(descriptors[route.key]?.options.title ?? route.name);
        const go = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        if (route.name === "index") {
          return <JarvisOrb key={route.key} focused={focused} onPress={go} />;
        }

        const Icon = ICONS[route.name] ?? NotebookText;
        return (
          <TabItem key={route.key} label={label} icon={Icon} focused={focused} onPress={go} />
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const t = useTheme();
  const { status } = useAuth();

  if (status === "signedOut") return <Redirect href="/sign-in" />;

  return (
    <Tabs
      // expo-router bundles its own @react-navigation/bottom-tabs; the props
      // are structurally identical to our direct copy, so bridge the
      // duplicate type identity with a cast.
      tabBar={(props) => <CraftTabBar {...(props as unknown as BottomTabBarProps)} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: t.c.canvas },
      }}
    >
      <Tabs.Screen name="wiki" options={{ title: "Wiki" }} />
      <Tabs.Screen name="tasks" options={{ title: "Tasks" }} />
      <Tabs.Screen name="index" options={{ title: "Jarvis" }} />
      <Tabs.Screen name="habits" options={{ title: "Habits" }} />
      <Tabs.Screen name="captures" options={{ title: "Captures" }} />
    </Tabs>
  );
}
