// Tab shell. JARVIS (the orb screen) is the center and default tab; Tasks,
// Habits, and Captures flank it. All four screens stay MOUNTED — inactive
// ones are display:none — so the JARVIS SSE stream, TTS queue, and any
// in-flight dictation survive tab switches.

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KiwiMark } from "../components/icons";
import { colors, mono } from "../theme";
import { CapturesScreen } from "./Captures";
import { HabitsScreen } from "./Habits";
import { Home } from "./Home";
import { TasksScreen } from "./Tasks";

type Tab = "tasks" | "habits" | "jarvis" | "captures";

const SIDE_TABS: Array<{ key: Tab; label: string }> = [
  { key: "tasks", label: "TASKS" },
  { key: "habits", label: "HABITS" },
  { key: "captures", label: "CAPTURES" },
];

export function Root() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("jarvis");

  const screen = (key: Tab, node: React.ReactNode) => (
    <View style={[styles.screen, tab !== key && styles.hidden]} pointerEvents={tab === key ? "auto" : "none"}>
      {node}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.stage}>
        {screen("tasks", <TasksScreen active={tab === "tasks"} />)}
        {screen("habits", <HabitsScreen active={tab === "habits"} />)}
        {screen("jarvis", <Home />)}
        {screen("captures", <CapturesScreen active={tab === "captures"} />)}
      </View>

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TabButton
          label="TASKS"
          active={tab === "tasks"}
          onPress={() => setTab("tasks")}
        />
        <TabButton
          label="HABITS"
          active={tab === "habits"}
          onPress={() => setTab("habits")}
        />
        <Pressable
          onPress={() => setTab("jarvis")}
          style={({ pressed }) => [styles.orbTab, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="JARVIS"
        >
          <View style={[styles.orbCircle, tab === "jarvis" && styles.orbCircleActive]}>
            <KiwiMark size={26} color={tab === "jarvis" ? colors.accent : colors.textDim} />
          </View>
        </Pressable>
        <TabButton
          label="CAPTURES"
          active={tab === "captures"}
          onPress={() => setTab("captures")}
        />
        <View style={styles.spacer} />
      </View>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={[styles.tabDot, active && styles.tabDotActive]} />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  stage: {
    flex: 1,
  },
  screen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  hidden: {
    display: "none",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 10,
    paddingHorizontal: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: "#070d12",
  },
  tab: {
    alignItems: "center",
    gap: 4,
    minWidth: 70,
  },
  tabDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "transparent",
  },
  tabDotActive: {
    backgroundColor: colors.accent,
  },
  tabLabel: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 10,
    letterSpacing: 1.5,
  },
  tabLabelActive: {
    color: colors.text,
  },
  orbTab: {
    marginTop: -22,
  },
  orbCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a1218",
    borderWidth: 1,
    borderColor: colors.border,
  },
  orbCircleActive: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  spacer: {
    width: 0,
  },
});
