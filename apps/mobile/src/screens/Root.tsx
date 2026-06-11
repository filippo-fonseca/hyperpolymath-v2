// Tab shell. JARVIS (the orb screen) is the literal center of the bottom
// bar — two icon tabs on each side (Tasks, Habits ◉ Training, Captures) for
// symmetry. All five screens stay MOUNTED — inactive ones are display:none —
// so the JARVIS SSE stream, TTS queue, and any in-flight dictation survive
// tab switches.

import { useCallback, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CelebrationOverlay } from "../components/celebrate";
import { KiwiMark, TabIcon } from "../components/icons";
import { colors, mono } from "../theme";
import { CapturesScreen } from "./Captures";
import { HabitsScreen } from "./Habits";
import { Home } from "./Home";
import { TasksScreen } from "./Tasks";
import { TrainingScreen } from "./Training";

type Tab = "tasks" | "habits" | "jarvis" | "training" | "captures";

export function Root() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("jarvis");
  const orbPulse = useRef(new Animated.Value(1)).current;

  const pulseOrb = useCallback(() => {
    Animated.sequence([
      Animated.timing(orbPulse, { toValue: 1.22, duration: 130, useNativeDriver: true }),
      Animated.spring(orbPulse, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [orbPulse]);

  const screen = (key: Tab, node: React.ReactNode) => (
    <View
      style={[styles.screen, tab !== key && styles.hidden]}
      pointerEvents={tab === key ? "auto" : "none"}
    >
      {node}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={styles.stage}>
        {screen("tasks", <TasksScreen active={tab === "tasks"} />)}
        {screen("habits", <HabitsScreen active={tab === "habits"} />)}
        {screen("jarvis", <Home />)}
        {screen("training", <TrainingScreen active={tab === "training"} />)}
        {screen("captures", <CapturesScreen active={tab === "captures"} />)}
      </View>

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TabButton icon="tasks" label="TASKS" active={tab === "tasks"} onPress={() => setTab("tasks")} />
        <TabButton icon="habits" label="HABITS" active={tab === "habits"} onPress={() => setTab("habits")} />
        {/* Fixed-width gap reserves the orb's slot; the orb itself is
            absolutely centered over the bar so flex rounding can never
            nudge it off-center. */}
        <View style={styles.orbGap} />
        <TabButton
          icon="training"
          label="TRAINING"
          active={tab === "training"}
          onPress={() => setTab("training")}
        />
        <TabButton
          icon="captures"
          label="CAPTURES"
          active={tab === "captures"}
          onPress={() => setTab("captures")}
        />
        <View style={styles.orbOverlay} pointerEvents="box-none">
          <Pressable
            onPress={() => setTab("jarvis")}
            style={({ pressed }) => [styles.orbTab, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="JARVIS"
          >
            <Animated.View
              style={[
                styles.orbCircle,
                tab === "jarvis" && styles.orbCircleActive,
                { transform: [{ scale: orbPulse }] },
              ]}
            >
              <KiwiMark size={26} color={tab === "jarvis" ? colors.accent : colors.textDim} />
            </Animated.View>
          </Pressable>
        </View>
      </View>

      <CelebrationOverlay
        targetBottom={Math.max(insets.bottom, 8) + 46}
        onArrive={pulseOrb}
      />
    </View>
  );
}

function TabButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: "tasks" | "habits" | "training" | "captures";
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
      <TabIcon name={icon} size={21} color={active ? colors.accent : colors.textDim} />
      <Text
        style={[styles.tabLabel, active && styles.tabLabelActive]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
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
    paddingTop: 10,
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: "#070d12",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  tabLabel: {
    color: colors.textDim,
    fontFamily: mono,
    fontSize: 8,
    letterSpacing: 0.5,
  },
  tabLabelActive: {
    color: colors.text,
  },
  orbGap: {
    width: 70,
  },
  orbOverlay: {
    position: "absolute",
    top: -24,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  orbTab: {},
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
});
