// Tab shell. JARVIS (the orb screen) is the literal center of the bottom
// bar — two icon tabs on each side (Tasks, Habits ◉ Training, Captures) for
// symmetry. All five screens stay MOUNTED — inactive ones are display:none —
// so the JARVIS SSE stream, TTS queue, and any in-flight dictation survive
// tab switches.

import * as Haptics from "expo-haptics";
import { useCallback, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
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

const TAB_ORDER: Tab[] = ["tasks", "habits", "jarvis", "training", "captures"];

export function Root() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("jarvis");
  const orbPulse = useRef(new Animated.Value(1)).current;
  // Voice trigger registered by <Home> — the nav kiwi button activates dictation.
  const voicePressRef = useRef<(() => void) | null>(null);

  const switchTab = useCallback((next: Tab) => {
    setTab(next);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // Horizontal swipe to navigate tabs.
  // Gesture is only claimed when it is clearly horizontal:
  //   |dx| > ~16px AND |dx| > 2.5 × |dy|  →  prevents hijacking vertical
  //   scrolling or horizontal sub-scrolls inside screens.
  // On release, switch if |dx| > 60px or velocity > 0.3.
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
              // left swipe → next tab
              const next = TAB_ORDER[Math.min(idx + 1, TAB_ORDER.length - 1)];
              if (next && next !== current) {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                return next;
              }
            } else {
              // right swipe → previous tab
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
    // The nav kiwi IS the voice button: jump to JARVIS and start dictation.
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
        {/* Fixed-width gap reserves the orb's slot; the orb itself is
            absolutely centered over the bar so flex rounding can never
            nudge it off-center. */}
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
            style={({ pressed }) => [styles.orbTab, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Dictate to JARVIS"
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
    top: -16,
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
