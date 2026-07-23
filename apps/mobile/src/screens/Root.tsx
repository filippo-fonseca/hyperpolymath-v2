// Tab shell. JARVIS is the center tab — Tasks, Habits ◉ Training, Captures.
// All five screens stay mounted (display:none when inactive) so SSE/TTS survive.

import * as Haptics from "expo-haptics";
import { useCallback, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CelebrationOverlay } from "../components/celebrate";
import { KiwiMark, TabIcon } from "../components/icons";
import { font, sd } from "../theme";
import { CapturesScreen } from "./Captures";
import { HabitsScreen } from "./Habits";
import { Home } from "./Home";
import { TasksScreen } from "./Tasks";
import { TrainingScreen } from "./Training";

type Tab = "tasks" | "habits" | "jarvis" | "training" | "captures";

const TAB_ORDER: Tab[] = ["tasks", "habits", "jarvis", "training", "captures"];

export function Root() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("jarvis");
  const orbPulse = useRef(new Animated.Value(1)).current;
  const voicePressRef = useRef<(() => void) | null>(null);

  const switchTab = useCallback((next: Tab) => {
    setTab(next);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => {
        const { dx, dy } = gs;
        return Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 2.5;
      },
      onPanResponderRelease: (_, gs) => {
        const { dx, vx } = gs;
        if (Math.abs(dx) > 60 || Math.abs(vx) > 0.3) {
          setTab((current) => {
            const idx = TAB_ORDER.indexOf(current);
            if (dx < 0) {
              const next = TAB_ORDER[Math.min(idx + 1, TAB_ORDER.length - 1)];
              if (next && next !== current) {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                return next;
              }
            } else {
              const prev = TAB_ORDER[Math.max(idx - 1, 0)];
              if (prev && prev !== current) {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                return prev;
              }
            }
            return current;
          });
        }
      },
    }),
  ).current;

  const pulseOrb = useCallback(() => {
    Animated.sequence([
      Animated.timing(orbPulse, { toValue: 1.22, duration: 130, useNativeDriver: true }),
      Animated.spring(orbPulse, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [orbPulse]);

  const handleJarvisNavPress = useCallback(() => {
    switchTab("jarvis");
    pulseOrb();
  }, [pulseOrb, switchTab]);

  const handleJarvisNavLongPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    switchTab("jarvis");
    voicePressRef.current?.();
    pulseOrb();
  }, [pulseOrb, switchTab]);

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
      <View style={styles.stage} {...panResponder.panHandlers}>
        {screen("tasks", <TasksScreen active={tab === "tasks"} />)}
        {screen("habits", <HabitsScreen active={tab === "habits"} />)}
        {screen(
          "jarvis",
          <Home onRegisterVoicePress={(fn) => { voicePressRef.current = fn; }} />,
        )}
        {screen("training", <TrainingScreen active={tab === "training"} />)}
        {screen("captures", <CapturesScreen active={tab === "captures"} />)}
      </View>

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TabButton icon="tasks" label="TASKS" active={tab === "tasks"} onPress={() => switchTab("tasks")} />
        <TabButton icon="habits" label="HABITS" active={tab === "habits"} onPress={() => switchTab("habits")} />
        <View style={styles.orbGap} />
        <TabButton
          icon="training"
          label="TRAINING"
          active={tab === "training"}
          onPress={() => switchTab("training")}
        />
        <TabButton
          icon="captures"
          label="CAPTURES"
          active={tab === "captures"}
          onPress={() => switchTab("captures")}
        />
        <View style={styles.orbOverlay} pointerEvents="box-none">
          <Pressable
            onPress={handleJarvisNavPress}
            onLongPress={handleJarvisNavLongPress}
            delayLongPress={350}
            style={({ pressed }) => [styles.orbTab, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="JARVIS — long-press to dictate"
          >
            <Animated.View
              style={[
                styles.orbCircle,
                tab === "jarvis" && styles.orbCircleActive,
                { transform: [{ scale: orbPulse }] },
              ]}
            >
              <KiwiMark size={26} color={tab === "jarvis" ? sd.accent : sd.inkFaint} />
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
      style={({ pressed }) => [
        styles.tab,
        active && styles.tabActive,
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <TabIcon name={icon} size={20} color={active ? sd.ink : sd.inkFaint} />
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
    backgroundColor: sd.app,
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
    paddingTop: 8,
    paddingHorizontal: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: sd.line,
    backgroundColor: sd.darkerBox,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 4,
    borderRadius: sd.radius.chrome,
  },
  tabActive: {
    backgroundColor: sd.selected,
  },
  tabLabel: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 8,
    letterSpacing: 0.8,
  },
  tabLabelActive: {
    color: sd.ink,
  },
  orbGap: {
    width: 70,
  },
  orbOverlay: {
    position: "absolute",
    top: -16,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  orbTab: {},
  orbCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: sd.box,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
  },
  orbCircleActive: {
    borderColor: sd.accent,
    backgroundColor: sd.selected,
  },
});
