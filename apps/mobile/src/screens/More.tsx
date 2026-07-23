import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProjectsSheet } from "../components/ProjectsSheet";
import { SettingsSheet } from "../components/SettingsSheet";
import { ScreenHeader } from "../components/shell";
import { font, sd } from "../theme";

export type MoreDestination = "habits" | "training" | "calendar";

const ITEMS: Array<{
  label: string;
  description: string;
  destination: MoreDestination;
}> = [
  {
    label: "Habits",
    description: "Daily routines and streak dots",
    destination: "habits",
  },
  {
    label: "Training",
    description: "Weekly activity planner",
    destination: "training",
  },
  {
    label: "Calendar",
    description: "Upcoming Google Calendar events",
    destination: "calendar",
  },
];

export function MoreScreen({
  active,
  onNavigate,
}: {
  active: boolean;
  onNavigate: (destination: MoreDestination) => void;
}) {
  const insets = useSafeAreaInsets();
  const [showProjects, setShowProjects] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const choose = (destination: MoreDestination) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onNavigate(destination);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="More" paddingTop={insets.top + 8} />
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.kicker}>SECONDARY SURFACES</Text>
        {ITEMS.map((item) => (
          <Pressable
            key={item.destination}
            onPress={() => choose(item.destination)}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.72 }]}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>{item.label}</Text>
              <Text style={styles.itemDescription}>{item.description}</Text>
            </View>
            <Text style={styles.chevron}>OPEN</Text>
          </Pressable>
        ))}

        <Text style={[styles.kicker, styles.kickerLower]}>REFERENCE</Text>
        <Pressable
          onPress={() => setShowProjects(true)}
          style={({ pressed }) => [styles.item, pressed && { opacity: 0.72 }]}
          accessibilityRole="button"
          accessibilityLabel="Projects"
        >
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>Projects</Text>
            <Text style={styles.itemDescription}>Areas and active projects</Text>
          </View>
          <Text style={styles.chevron}>SHEET</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowSettings(true)}
          style={({ pressed }) => [styles.item, pressed && { opacity: 0.72 }]}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <View style={styles.itemBody}>
            <Text style={styles.itemTitle}>Settings</Text>
            <Text style={styles.itemDescription}>Server, auth token, and voice controls</Text>
          </View>
          <Text style={styles.chevron}>SHEET</Text>
        </Pressable>
        <View style={{ height: 90 }} />
      </ScrollView>

      <ProjectsSheet visible={active && showProjects} onClose={() => setShowProjects(false)} />
      <SettingsSheet visible={active && showSettings} onClose={() => setShowSettings(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: sd.app,
  },
  list: {
    paddingHorizontal: 20,
  },
  kicker: {
    color: sd.inkFaint,
    fontFamily: font.mono,
    fontSize: 11,
    letterSpacing: 1.6,
    marginBottom: 8,
  },
  kickerLower: {
    marginTop: 22,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: sd.radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: sd.line,
    backgroundColor: sd.box,
    padding: 15,
    marginBottom: 10,
  },
  itemBody: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    color: sd.ink,
    fontFamily: font.sansSemiBold,
    fontSize: 17,
  },
  itemDescription: {
    color: sd.inkFaint,
    fontFamily: font.sans,
    fontSize: 13,
  },
  chevron: {
    color: sd.accent,
    fontFamily: font.mono,
    fontSize: 10,
    letterSpacing: 1,
  },
});
